import express, { Router } from "express";
import mongoose from "mongoose";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { auth, role, verified, HttpError, type AuthRequest } from "./shared";
import { Profile, Resume, Upload, Application } from "./hiring-models";
import { notify } from "./notifications";
import { cancelInterviews } from "./interviews";
import { Company, Job, Project, Member } from "./models";
import { config } from "./config";
import {
  putPrivate,
  readPrivate,
  removePrivate,
  uploadUrl,
  validatePdf,
} from "./storage";
import { MAX_CV_BYTES } from "@crewup/shared/hiring";
export const candidateRouter = Router();
export const recordId = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, "Invalid record ID.");
const optionalDate = z.union([z.iso.date(), z.literal("")]).default("");
const profileBody = z
  .object({
    headline: z.string().trim().min(3).max(120),
    bio: z.string().trim().min(20).max(3000),
    skills: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
    location: z.string().trim().min(2).max(100),
    portfolioUrl: z
      .string()
      .max(500)
      .refine(
        (v) =>
          !v ||
          (URL.canParse(v) &&
            ["http:", "https:"].includes(new URL(v).protocol)),
        "Use an HTTP or HTTPS portfolio URL.",
      )
      .default(""),
    availableFrom: optionalDate,
    availableUntil: optionalDate,
  })
  .strict()
  .refine(
    (v) =>
      !v.availableFrom ||
      !v.availableUntil ||
      v.availableUntil >= v.availableFrom,
    { message: "Availability end date must follow its start date." },
  );
export async function populatedJobs(ids: any[]) {
  const jobs: any[] = await Job.find({ _id: { $in: ids } }).lean();
  const [companies, projects]: any[] = await Promise.all([
    Company.find({ _id: { $in: jobs.map((j) => j.companyId) } })
      .select("name status")
      .lean(),
    Project.find({ _id: { $in: jobs.map((j) => j.projectId) } }).lean(),
  ]);
  return jobs.map((j) => ({
    ...j,
    company: companies.find((c: any) => String(c._id) === String(j.companyId)),
    project: projects.find((p: any) => String(p._id) === String(j.projectId)),
    available:
      j.status === "open" &&
      companies.some(
        (c: any) =>
          String(c._id) === String(j.companyId) && c.status === "verified",
      ) &&
      projects.some(
        (p: any) =>
          String(p._id) === String(j.projectId) && p.status === "active",
      ),
  }));
}
candidateRouter.use(auth, role("applicant"));
candidateRouter.get("/", async (req: AuthRequest, res) => {
  const userId = req.actor!.id;
  const [profile, resumes, applications, total, active, hired]: any[] =
    await Promise.all([
      Profile.findOne({ userId }).lean(),
      Resume.find({ userId }).sort({ _id: -1 }).limit(20).lean(),
      Application.find({ userId })
        .select("-history.actorId")
        .sort({ _id: -1 })
        .limit(51)
        .lean(),
      Application.countDocuments({ userId }),
      Application.countDocuments({
        userId,
        status: "active",
        stage: { $nin: ["hired", "rejected"] },
      }),
      Application.countDocuments({ userId, stage: "hired" }),
    ]);
  const page = applications.slice(0, 50);
  res.json({
    profile,
    resumes,
    applications: page,
    nextCursor: applications.length > 50 ? String(page.at(-1)._id) : null,
    savedJobs: await populatedJobs(profile?.savedJobIds || []),
    stats: { total, active, hired },
  });
});
candidateRouter.get("/applications", async (req: AuthRequest, res) => {
  const cursor = req.query.cursor
    ? recordId.parse(req.query.cursor)
    : undefined;
  const applications: any[] = await Application.find({
    userId: req.actor!.id,
    ...(cursor ? { _id: { $lt: cursor } } : {}),
  })
    .select("-history.actorId")
    .sort({ _id: -1 })
    .limit(51)
    .lean();
  const page = applications.slice(0, 50);
  res.json({
    applications: page,
    nextCursor: applications.length > 50 ? String(page.at(-1)._id) : null,
  });
});
candidateRouter.use(verified);
candidateRouter.put("/profile", async (req: AuthRequest, res) => {
  const data = profileBody.parse(req.body);
  const profile = await Profile.findOneAndUpdate(
    { userId: req.actor!.id },
    { $set: data, $inc: { revision: 1 } },
    { upsert: true, new: true, runValidators: true },
  );
  res.json({ profile });
});
candidateRouter.post("/saved", async (req: AuthRequest, res) => {
  const { jobId } = z.object({ jobId: recordId }).strict().parse(req.body);
  const [job] = await populatedJobs([jobId]);
  if (!job?.available)
    throw new HttpError(404, "This role is no longer available.");
  const profile = await Profile.findOneAndUpdate(
    {
      userId: req.actor!.id,
      $or: [{ savedJobIds: jobId }, { "savedJobIds.99": { $exists: false } }],
    },
    { $addToSet: { savedJobIds: jobId } },
    { new: true },
  );
  if (!profile)
    throw new HttpError(
      422,
      "Complete your profile first, or remove a saved role if you have reached 100.",
    );
  res.json({ ok: true });
});
candidateRouter.delete("/saved/:id", async (req: AuthRequest, res) => {
  await Profile.updateOne(
    { userId: req.actor!.id },
    { $pull: { savedJobIds: recordId.parse(req.params.id) } },
  );
  res.json({ ok: true });
});
candidateRouter.post("/uploads", async (req: AuthRequest, res) => {
  const data = z
    .object({
      filename: z
        .string()
        .trim()
        .min(5)
        .max(120)
        .regex(/^[^/\\\x00-\x1f]+\.pdf$/i, "Choose a PDF file."),
      size: z.number().int().min(1).max(MAX_CV_BYTES),
    })
    .strict()
    .parse(req.body);
  if (!(await Profile.exists({ userId: req.actor!.id })))
    throw new HttpError(422, "Save your profile before uploading a CV.");
  if (
    (await Resume.countDocuments({
      userId: req.actor!.id,
      createdAt: { $gte: new Date(Date.now() - 86400000) },
    })) >= 20
  )
    throw new HttpError(429, "You can upload up to 20 CV versions per day.");
  const storageKey = `tmp/${req.actor!.id}/${randomUUID()}.pdf`;
  const upload = await Upload.create({
    ...data,
    userId: req.actor!.id,
    storageKey,
    resumeId: new mongoose.Types.ObjectId(),
    storage: config.FILE_STORAGE,
    expiresAt: new Date(Date.now() + 300000),
  });
  res.status(201).json({
    id: upload.id,
    url:
      config.FILE_STORAGE === "s3"
        ? await uploadUrl(storageKey, data.size)
        : `/api/candidate/uploads/${upload.id}/content`,
    direct: config.FILE_STORAGE === "s3",
  });
});
candidateRouter.put(
  "/uploads/:id/content",
  express.raw({ type: "application/pdf", limit: MAX_CV_BYTES }),
  async (req: AuthRequest, res) => {
    const upload = await Upload.findOne({
      _id: recordId.parse(req.params.id),
      userId: req.actor!.id,
      state: "pending",
      storage: "local",
      expiresAt: { $gt: new Date() },
    }).select("+storageKey");
    if (!upload)
      throw new HttpError(404, "Upload expired. Choose the file again.");
    if (!Buffer.isBuffer(req.body) || req.body.length !== upload.size)
      throw new HttpError(422, "Upload size or content type does not match.");
    await validatePdf(req.body);
    try {
      await putPrivate("local", upload.storageKey, req.body);
    } catch (e: any) {
      if (e.code !== "EEXIST") throw e;
      const old = await readPrivate("local", upload.storageKey);
      if (!old.equals(req.body))
        throw new HttpError(409, "Upload already contains a different file.");
    }
    res.json({ ok: true });
  },
);
candidateRouter.post("/uploads/:id/confirm", async (req: AuthRequest, res) => {
  const query = { _id: recordId.parse(req.params.id), userId: req.actor!.id };
  const prior = await Upload.findOne(query);
  if (prior?.state === "confirmed") {
    return res.json({ resume: await Resume.findById(prior.resumeId) });
  }
  if (prior) {
    const retained = await Resume.findOne({
      _id: prior.resumeId,
      userId: req.actor!.id,
    });
    if (retained) {
      await Upload.updateOne(query, { $set: { state: "confirmed" } });
      return res.json({ resume: retained });
    }
  }
  const upload = await Upload.findOneAndUpdate(
    { ...query, state: "pending", expiresAt: { $gt: new Date() } },
    { $set: { state: "processing" } },
    { new: true },
  ).select("+storageKey");
  if (!upload)
    throw new HttpError(409, "Upload is expired or already being processed.");
  let finalKey = "";
  try {
    const bytes = await readPrivate(upload.storage, upload.storageKey);
    if (bytes.length !== upload.size)
      throw new HttpError(422, "Uploaded file size does not match.");
    await validatePdf(bytes);
    finalKey = `resumes/${req.actor!.id}/${randomUUID()}.pdf`;
    await putPrivate(upload.storage, finalKey, bytes);
    const resume = await Resume.create({
      _id: upload.resumeId,
      userId: req.actor!.id,
      filename: upload.filename,
      storageKey: finalKey,
      storage: upload.storage,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    await Upload.updateOne(query, { $set: { state: "confirmed" } });
    await removePrivate(upload.storage, upload.storageKey).catch(() => {});
    res.status(201).json({ resume: await Resume.findById(resume._id) });
  } catch (e) {
    if (finalKey && !(await Resume.exists({ _id: upload.resumeId })))
      await removePrivate(upload.storage, finalKey).catch(() => {});
    await Upload.updateOne(
      { ...query, state: "processing" },
      { $set: { state: "pending" } },
    );
    throw e;
  }
});
const applyBody = z
  .object({
    resumeId: recordId,
    entries: z
      .array(
        z
          .object({
            jobId: recordId,
            jobUpdatedAt: z.iso.datetime(),
            coverLetter: z.string().trim().min(20).max(3000),
            answers: z
              .array(
                z
                  .object({
                    questionId: z.string().min(1).max(64),
                    answer: z.string().trim().max(2000),
                  })
                  .strict(),
              )
              .max(5)
              .default([]),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict()
  .refine(
    (v) => new Set(v.entries.map((e) => e.jobId)).size === v.entries.length,
    "Select each role only once.",
  );
candidateRouter.post("/applications", async (req: AuthRequest, res) => {
  const data = applyBody.parse(req.body);
  let created: string[] = [],
    existing: string[] = [];
  await mongoose.connection.transaction(async (session) => {
    created = [];
    existing = [];
    const profile = await Profile.findOneAndUpdate(
      { userId: req.actor!.id },
      { $inc: { revision: 1 } },
      { new: true, session },
    );
    if (!profile?.headline || !profile.skills?.length)
      throw new HttpError(422, "Complete your profile before applying.");
    const resume = await Resume.findOne({
      _id: data.resumeId,
      userId: req.actor!.id,
    }).session(session);
    if (!resume) throw new HttpError(422, "Choose one of your uploaded CVs.");
    for (const entry of [...data.entries].sort((a, b) =>
      a.jobId.localeCompare(b.jobId),
    )) {
      const previous = await Application.findOne({
        userId: req.actor!.id,
        jobId: entry.jobId,
      }).session(session);
      if (previous) {
        existing.push(String(previous._id));
        continue;
      }
      const job = await Job.findOneAndUpdate(
        {
          _id: entry.jobId,
          status: "open",
          updatedAt: new Date(entry.jobUpdatedAt),
        },
        { $inc: { __v: 1 } },
        { new: true, session, timestamps: false },
      );
      if (!job)
        throw new HttpError(
          409,
          "A selected role changed or closed. Refresh the board and review it again.",
        );
      const company = await Company.findOneAndUpdate(
        { _id: job.companyId, status: "verified" },
        { $inc: { __v: 1 } },
        { new: true, session, timestamps: false },
      );
      const project = await Project.findOne({
        _id: job.projectId,
        companyId: job.companyId,
        status: "active",
      }).session(session);
      if (!company || !project)
        throw new HttpError(
          409,
          "A selected company or project is no longer accepting applications.",
        );
      const questions = job.screeningQuestions || [];
      if (
        new Set(entry.answers.map((a) => a.questionId)).size !==
          entry.answers.length ||
        entry.answers.some(
          (a) => !questions.some((q: any) => q.id === a.questionId),
        )
      )
        throw new HttpError(
          422,
          "Screening questions changed. Review the role again.",
        );
      for (const q of questions)
        if (
          q.required &&
          !entry.answers.some((a) => a.questionId === q.id && a.answer.length)
        )
          throw new HttpError(422, `Answer the screening question: ${q.text}`);
      const [application] = await Application.create(
        [
          {
            userId: req.actor!.id,
            companyId: company._id,
            projectId: project._id,
            jobId: job._id,
            resumeId: resume._id,
            coverLetter: entry.coverLetter,
            answers: questions.map((q: any) => ({
              questionId: q.id,
              question: q.text,
              answer:
                entry.answers.find((a) => a.questionId === q.id)?.answer || "",
            })),
            snapshot: {
              candidate: {
                name: req.actor!.name,
                email: req.actor!.email,
                headline: profile.headline,
                bio: profile.bio,
                skills: profile.skills,
                location: profile.location,
                portfolioUrl: profile.portfolioUrl,
                availableFrom: profile.availableFrom,
                availableUntil: profile.availableUntil,
              },
              resume: {
                id: String(resume._id),
                filename: resume.filename,
                size: resume.size,
                sha256: resume.sha256,
              },
              job: {
                title: job.title,
                description: job.description,
                skills: job.skills,
                budgetMin: job.budgetMin,
                budgetMax: job.budgetMax,
                currency: job.currency,
                employmentType: job.employmentType,
                updatedAt: job.updatedAt,
              },
              project: {
                name: project.name,
                startDate: project.startDate,
                endDate: project.endDate,
                workMode: project.workMode,
                location: project.location,
              },
              company: { name: company.name },
            },
            history: [
              { stage: "applied", at: new Date(), actorId: req.actor!.id },
            ],
          },
        ],
        { session },
      );
      created.push(String(application._id));
      await notify(
        req.actor!.id,
        "Application submitted",
        `${job.title} at ${company.name}.`,
        "Applications",
        session,
      );
      const reviewers = await Member.find({ companyId: company._id }).session(
        session,
      );
      for (const m of reviewers)
        await notify(
          m.userId,
          "New application",
          `${req.actor!.name} applied for ${job.title}.`,
          "Applications",
          session,
        );
      await Profile.updateOne(
        { _id: profile._id },
        { $pull: { savedJobIds: job._id } },
        { session },
      );
    }
  });
  res.status(created.length ? 201 : 200).json({
    created,
    existing,
    message: created.length
      ? `${created.length} application${created.length === 1 ? "" : "s"} submitted.`
      : "You already applied to these roles.",
  });
});
candidateRouter.patch(
  "/applications/:id/withdraw",
  async (req: AuthRequest, res) => {
    const { version } = z
      .object({ version: z.number().int().min(0) })
      .strict()
      .parse(req.body);
    await mongoose.connection.transaction(async (session) => {
      const app = await Application.findOneAndUpdate(
        {
          _id: recordId.parse(req.params.id),
          userId: req.actor!.id,
          version,
          status: "active",
          stage: { $nin: ["hired", "rejected"] },
        },
        {
          $set: { status: "withdrawn" },
          $inc: { version: 1 },
          $push: {
            history: {
              stage: "withdrawn",
              at: new Date(),
              actorId: req.actor!.id,
            },
          },
        },
        { new: true, session },
      );
      if (!app)
        throw new HttpError(
          409,
          "This application changed or can no longer be withdrawn. Refresh and try again.",
        );
      await cancelInterviews(
        app,
        "Candidate withdrew the application.",
        session,
      );
      await notify(
        req.actor!.id,
        "Application withdrawn",
        `${app.snapshot.job.title} was withdrawn.`,
        "Applications",
        session,
      );
      const reviewers = await Member.find({ companyId: app.companyId }).session(
        session,
      );
      for (const m of reviewers)
        await notify(
          m.userId,
          "Application withdrawn",
          `${app.snapshot.candidate.name} withdrew from ${app.snapshot.job.title}.`,
          "Applications",
          session,
        );
    });
    res.json({ ok: true });
  },
);
