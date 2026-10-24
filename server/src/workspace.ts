import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { createHash } from "node:crypto";
import { Company, Member, Project, Job } from "./models";
import {
  auth,
  role,
  member,
  verified,
  canPost,
  HttpError,
  type AuthRequest,
} from "./shared";
export const workspaceRouter = Router();
const id = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid record ID.");
const companyBody = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().min(20).max(2000),
    industry: z.string().trim().min(2).max(80),
    website: z
      .union([
        z
          .url()
          .refine(
            (v) =>
              URL.canParse(v) &&
              ["http:", "https:"].includes(new URL(v).protocol),
            "Use an HTTP or HTTPS website.",
          ),
        z.literal(""),
      ])
      .default(""),
  })
  .strict();
const projectBody = z
  .object({
    name: z.string().trim().min(3).max(100),
    description: z.string().trim().min(20).max(4000),
    category: z.enum([
      "Software & technology",
      "Design & creative",
      "Marketing & content",
      "Operations & other",
    ]),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    workMode: z.enum(["remote", "hybrid", "onsite"]),
    location: z.string().trim().max(100).default(""),
  })
  .strict()
  .refine((v) => v.endDate >= v.startDate, {
    message: "End date must be on or after the start date.",
    path: ["endDate"],
  })
  .refine((v) => v.workMode === "remote" || v.location.length > 1, {
    message: "Please specify the work location.",
    path: ["location"],
  });
const jobBody = z
  .object({
    projectId: id,
    title: z.string().trim().min(3).max(100),
    description: z.string().trim().min(20).max(4000),
    skills: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
    screeningQuestions: z
      .array(
        z
          .object({
            text: z.string().trim().min(5).max(300),
            required: z.boolean().default(true),
          })
          .strict(),
      )
      .max(5)
      .default([])
      .transform((qs) =>
        qs.map((q) => ({
          ...q,
          id: createHash("sha256").update(q.text).digest("hex").slice(0, 16),
        })),
      )
      .refine(
        (qs) => new Set(qs.map((q) => q.id)).size === qs.length,
        "Screening questions must be unique.",
      ),
    budgetMin: z.number().min(1).max(100000000),
    budgetMax: z.number().min(1).max(100000000),
    currency: z.enum(["USD", "PKR", "GBP", "EUR"]),
    employmentType: z.enum([
      "contract",
      "part_time",
      "full_time",
      "internship",
    ]),
  })
  .strict()
  .refine((v) => v.budgetMax >= v.budgetMin, {
    message: "Maximum budget must be at least the minimum budget.",
    path: ["budgetMax"],
  });
workspaceRouter.use(auth, role("recruiter"));
workspaceRouter.get("/", async (req: AuthRequest, res) => {
  const membership: any = await Member.findOne({
    userId: req.actor!.id,
  }).lean();
  if (!membership) return res.json({ company: null, projects: [], jobs: [] });
  const companyId = membership.companyId;
  const [company, projects, jobs] = await Promise.all([
    Company.findById(companyId).lean(),
    Project.find({ companyId }).sort({ createdAt: -1 }).lean(),
    Job.find({ companyId }).sort({ createdAt: -1 }).lean(),
  ]);
  res.json({ company, projects, jobs, membership });
});
workspaceRouter.post("/company", verified, async (req: AuthRequest, res) => {
  const data = companyBody.parse(req.body);
  let company;
  await mongoose.connection.transaction(async (session) => {
    if (await Member.exists({ userId: req.actor!.id }).session(session))
      throw new HttpError(409, "You already belong to a company.");
    [company] = await Company.create([{ ...data, ownerId: req.actor!.id }], {
      session,
    });
    await Member.create(
      [{ companyId: company._id, userId: req.actor!.id, role: "owner" }],
      { session },
    );
  });
  res.status(201).json({ company });
});
workspaceRouter.use(
  member,
  verified,
  canPost,
  async (req: AuthRequest, _res, next) => {
    const company = await Company.findById(req.membership!.companyId);
    if (!company || company.status === "suspended")
      throw new HttpError(403, "This company workspace is suspended.");
    next();
  },
);
workspaceRouter.post("/projects", async (req: AuthRequest, res) => {
  const data = projectBody.parse(req.body);
  const c = await Company.findById(req.membership!.companyId);
  if (!c || c.status === "suspended")
    throw new HttpError(403, "This company workspace is suspended.");
  const project = await Project.create({
    ...data,
    companyId: req.membership!.companyId,
  });
  res.status(201).json({ project });
});
workspaceRouter.patch("/projects/:id", async (req: AuthRequest, res) => {
  const data = projectBody.parse(req.body);
  const project = await Project.findOneAndUpdate(
    { _id: id.parse(req.params.id), companyId: req.membership!.companyId },
    { $set: data },
    { new: true, runValidators: true },
  );
  if (!project) throw new HttpError(404, "Project not found.");
  res.json({ project });
});
workspaceRouter.post("/jobs", async (req: AuthRequest, res) => {
  const data = jobBody.parse(req.body);
  const project = await Project.findOne({
    _id: data.projectId,
    companyId: req.membership!.companyId,
    status: "active",
  });
  if (!project) throw new HttpError(404, "Project not found.");
  const c = await Company.findById(req.membership!.companyId);
  if (c?.status === "suspended")
    throw new HttpError(403, "Company is suspended.");
  const job = await Job.create({
    ...data,
    companyId: req.membership!.companyId,
  });
  res.status(201).json({ job });
});
workspaceRouter.patch("/jobs/:id", async (req: AuthRequest, res) => {
  const data = jobBody.parse(req.body);
  if (
    !(await Project.exists({
      _id: data.projectId,
      companyId: req.membership!.companyId,
    }))
  )
    throw new HttpError(404, "Project not found.");
  const job = await Job.findOneAndUpdate(
    { _id: id.parse(req.params.id), companyId: req.membership!.companyId },
    { $set: data },
    { new: true, runValidators: true },
  );
  if (!job) throw new HttpError(404, "Job not found.");
  res.json({ job });
});
workspaceRouter.patch("/jobs/:id/status", async (req: AuthRequest, res) => {
  const { status } = z
    .object({ status: z.enum(["open", "closed"]) })
    .strict()
    .parse(req.body);
  const jobId = id.parse(req.params.id);
  let job;
  await mongoose.connection.transaction(async (session) => {
    const company = await Company.findOneAndUpdate(
      { _id: req.membership!.companyId, status: "verified" },
      { $inc: { __v: 1 } },
      { session, new: true },
    );
    if (!company)
      throw new HttpError(
        403,
        "Your company must be approved before managing live jobs.",
      );
    if(status==='open' && await Job.exists({_id:jobId,companyId:req.membership!.companyId,moderationBlocked:true}).session(session))throw new HttpError(403,'This role is on an administrator moderation hold.');
    job = await Job.findOneAndUpdate(
      { _id: jobId, companyId: req.membership!.companyId },
      { $set: { status } },
      { new: true, session },
    );
    if (!job) throw new HttpError(404, "Job not found.");
  });
  res.json({ job });
});
