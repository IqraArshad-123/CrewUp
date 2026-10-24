import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Application, Resume } from "./hiring-models";
import { Company, Member, Job, Project } from "./models";
import {
  auth,
  role,
  member,
  verified,
  canPost,
  HttpError,
  type AuthRequest,
} from "./shared";
import { recordId } from "./candidate";
import { stages, nextStages } from "@crewup/shared/hiring";
import { readPrivate, privateDownloadUrl } from "./storage";
import { notify } from "./notifications";
import { cancelInterviews } from "./interviews";
import { stageLabel } from "@crewup/shared/hiring";
export const hiringRouter = Router();
export const filesRouter = Router();
hiringRouter.use(
  auth,
  role("recruiter"),
  verified,
  member,
  async (req: AuthRequest, _res, next) => {
    if (
      !(await Company.exists({
        _id: req.membership!.companyId,
        status: "verified",
      }))
    )
      throw new HttpError(403, "An approved company workspace is required.");
    next();
  },
);
hiringRouter.get("/", async (req: AuthRequest, res) => {
  const companyId = new mongoose.Types.ObjectId(req.membership!.companyId);
  const cursor = req.query.cursor
    ? recordId.parse(req.query.cursor)
    : undefined;
  const jobId = req.query.jobId ? recordId.parse(req.query.jobId) : undefined;
  const stage = req.query.stage
    ? z.enum(stages).parse(req.query.stage)
    : undefined;
  const filter = {
    companyId,
    ...(jobId ? { jobId } : {}),
    ...(stage ? { stage } : {}),
    ...(cursor ? { _id: { $lt: cursor } } : {}),
  };
  const [applications, stats, coverage, jobs, projects]: any[] =
    await Promise.all([
      Application.find(filter)
        .select("+notes -history.actorId")
        .sort({ _id: -1 })
        .limit(51)
        .lean(),
      Application.aggregate([
        { $match: { companyId } },
        {
          $group: {
            _id: {
              $cond: [{ $eq: ["$status", "withdrawn"] }, "withdrawn", "$stage"],
            },
            count: { $sum: 1 },
          },
        },
      ]),
      Application.aggregate([
        { $match: { companyId, stage: "hired", status: "active" } },
        {
          $group: {
            _id: "$jobId",
            hires: { $sum: 1 },
            availability: {
              $push: {
                from: "$snapshot.candidate.availableFrom",
                until: "$snapshot.candidate.availableUntil",
              },
            },
          },
        },
      ]),
      Job.find({ companyId }).select("title projectId status").lean(),
      Project.find({ companyId }).select("name startDate endDate").lean(),
    ]);
  const page = applications.slice(0, 50);
  res.json({
    applications: page,
    nextCursor: applications.length > 50 ? String(page.at(-1)._id) : null,
    stats: Object.fromEntries(stats.map((s: any) => [s._id, s.count])),
    coverage: coverage.map((c: any) => {
      const job = jobs.find((j: any) => String(j._id) === String(c._id));
      const project = projects.find(
        (p: any) => String(p._id) === String(job?.projectId),
      );
      const start = project?.startDate?.toISOString().slice(0, 10),
        end = project?.endDate?.toISOString().slice(0, 10);
      return {
        _id: c._id,
        hires: c.hires,
        dateCoverage: c.availability.filter(
          (a: any) =>
            a.from &&
            a.until &&
            start &&
            end &&
            a.from <= start &&
            a.until >= end,
        ).length,
      };
    }),
    jobs,
    projects,
    canManage: ["owner", "hr_manager", "recruiter"].includes(
      req.membership!.role,
    ),
  });
});
hiringRouter.patch(
  "/applications/:id/stage",
  canPost,
  async (req: AuthRequest, res) => {
    const { stage, version } = z
      .object({ stage: z.enum(stages), version: z.number().int().min(0) })
      .strict()
      .parse(req.body);
    let updated;
    await mongoose.connection.transaction(async (session) => {
      const company = await Company.findOneAndUpdate(
        { _id: req.membership!.companyId, status: "verified" },
        { $inc: { __v: 1 } },
        { new: true, session, timestamps: false },
      );
      if (!company) throw new HttpError(403, "Company is not approved.");
      const app = await Application.findOne({
        _id: recordId.parse(req.params.id),
        companyId: company._id,
      }).session(session);
      if (!app) throw new HttpError(404, "Application not found.");
      if (app.status !== "active" || !nextStages(app.stage).includes(stage))
        throw new HttpError(
          422,
          "Stages only move forward; hired, rejected and withdrawn applications are final.",
        );
      updated = await Application.findOneAndUpdate(
        { _id: app._id, version },
        {
          $set: { stage },
          $inc: { version: 1 },
          $push: { history: { stage, at: new Date(), actorId: req.actor!.id } },
        },
        { new: true, session },
      );
      if (!updated)
        throw new HttpError(
          409,
          "Another reviewer updated this application. Refresh and review it again.",
        );
      await cancelInterviews(
        app,
        `Application moved to ${stageLabel(stage)}.`,
        session,
      );
      await notify(
        app.userId,
        "Application updated",
        `${app.snapshot.job.title}: ${stageLabel(stage)}.`,
        "Applications",
        session,
      );
    });
    res.json({ ok: true });
  },
);
hiringRouter.patch(
  "/applications/:id/notes",
  canPost,
  async (req: AuthRequest, res) => {
    const { notes, version } = z
      .object({
        notes: z.string().trim().max(4000),
        version: z.number().int().min(0),
      })
      .strict()
      .parse(req.body);
    const app = await Application.findOneAndUpdate(
      {
        _id: recordId.parse(req.params.id),
        companyId: req.membership!.companyId,
        version,
      },
      { $set: { notes }, $inc: { version: 1 } },
      { new: true },
    );
    if (!app)
      throw new HttpError(
        409,
        "Application changed or is unavailable. Refresh and try again.",
      );
    res.json({ ok: true });
  },
);
filesRouter.get("/resumes/:id", auth, async (req: AuthRequest, res) => {
  const id = recordId.parse(req.params.id);
  const resume = await Resume.findById(id).select("+storageKey");
  if (!resume) throw new HttpError(404, "CV not found.");
  let allowed = String(resume.userId) === req.actor!.id;
  if (!allowed && req.actor!.role === "recruiter" && req.actor!.verified) {
    const membership = await Member.findOne({ userId: req.actor!.id });
    allowed =
      !!membership &&
      !!(await Company.exists({
        _id: membership.companyId,
        status: "verified",
      })) &&
      !!(await Application.exists({
        companyId: membership.companyId,
        resumeId: resume._id,
      }));
  }
  if (!allowed) throw new HttpError(404, "CV not found.");
  if(resume.storage === "s3"){res.set("Cache-Control","private, no-store");return res.redirect(302,await privateDownloadUrl(resume.storageKey,resume.filename));}
  const bytes = await readPrivate(resume.storage, resume.storageKey);
  res
    .set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cv.pdf"; filename*=UTF-8''${encodeURIComponent(resume.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    })
    .send(bytes);
});
