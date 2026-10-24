import { Router } from "express";
import mongoose, { Schema } from "mongoose";
import { z } from "zod";
import { User, Session, Job, Company } from "./models";
import { Application } from "./hiring-models";
import { Interview, MailJob } from "./day3-models";
import { auth, role, HttpError, type AuthRequest } from "./shared";
const auditSchema = new Schema(
  {
    actorId: Schema.Types.ObjectId,
    action: String,
    targetId: Schema.Types.ObjectId,
    reason: String,
  },
  { timestamps: true },
);
export const Audit =
  mongoose.models.Audit || mongoose.model("Audit", auditSchema);
const id = z.string().regex(/^[a-f0-9]{24}$/i);
export const adminRouter = Router();
adminRouter.use(auth, role("admin"));
adminRouter.get("/records/:kind", async (req, res) => {
  const kind = z.enum(["users", "jobs", "audit"]).parse(req.params.kind);
  const cursor = req.query.cursor ? id.parse(req.query.cursor) : null;
  const q = z.string().max(100).default("").parse(req.query.q);
  const filter: any = cursor ? { _id: { $lt: cursor } } : {};
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = (
      kind === "users"
        ? ["name", "email"]
        : kind === "jobs"
          ? ["title"]
          : ["action"]
    ).map((k) => ({ [k]: { $regex: escaped, $options: "i" } }));
  }
  const Model = kind === "users" ? User : kind === "jobs" ? Job : Audit;
  const fields =
    kind === "users"
      ? "name email role status verified createdAt"
      : kind === "jobs"
        ? "title companyId status moderationBlocked moderationReason createdAt"
        : "";
  const rows = await Model.find(filter)
    .select(fields)
    .sort({ _id: -1 })
    .limit(51)
    .lean();
  res.json({
    items: rows.slice(0, 50),
    nextCursor: rows.length > 50 ? String(rows[49]._id) : null,
  });
});
adminRouter.get("/metrics", async (_req, res) => {
  const [
    applications,
    stages,
    interviews,
    failedEmails,
    pendingCompanies,
    suspendedUsers,
  ] = await Promise.all([
    Application.countDocuments(),
    Application.aggregate([{ $group: { _id: "$stage", count: { $sum: 1 } } }]),
    Interview.countDocuments({ status: "scheduled" }),
    MailJob.countDocuments({ status: "failed" }),
    Company.countDocuments({ status: "pending" }),
    User.countDocuments({ status: "suspended" }),
  ]);
  res.json({
    applications,
    stages,
    interviews,
    failedEmails,
    pendingCompanies,
    suspendedUsers,
  });
});
adminRouter.patch("/users/:id/status", async (req: AuthRequest, res) => {
  const target = id.parse(req.params.id),
    d = z
      .object({
        status: z.enum(["active", "suspended"]),
        reason: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(req.body);
  await mongoose.connection.transaction(async (session) => {
    const u = await User.findById(target).session(session);
    if (!u) throw new HttpError(404, "User not found.");
    if (u.role === "admin")
      throw new HttpError(403, "Administrator accounts are protected.");
    u.status = d.status;
    u.authVersion = (u.authVersion || 0) + 1;
    await u.save({ session });
    await Session.deleteMany({ userId: target }, { session });
    await Audit.create(
      [
        {
          actorId: req.actor!.id,
          action: `user.${d.status}`,
          targetId: target,
          reason: d.reason,
        },
      ],
      { session },
    );
  });
  res.json({
    message: "Account updated. Previous sessions have been revoked.",
  });
});
adminRouter.patch("/jobs/:id/moderation", async (req: AuthRequest, res) => {
  const target = id.parse(req.params.id),
    d = z
      .object({
        blocked: z.boolean(),
        reason: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(req.body);
  await mongoose.connection.transaction(async (session) => {
    const j = await Job.findByIdAndUpdate(
      target,
      {
        $set: {
          moderationBlocked: d.blocked,
          moderationReason: d.reason,
          ...(d.blocked ? { status: "closed" } : {}),
        },
      },
      { new: true, session },
    );
    if (!j) throw new HttpError(404, "Job not found.");
    await Audit.create(
      [
        {
          actorId: req.actor!.id,
          action: d.blocked ? "job.blocked" : "job.released",
          targetId: target,
          reason: d.reason,
        },
      ],
      { session },
    );
  });
  res.json({
    message: d.blocked
      ? "Role closed and blocked from publication."
      : "Moderation hold removed. The company may publish the role again.",
  });
});
