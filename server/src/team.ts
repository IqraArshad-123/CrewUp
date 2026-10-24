import { Router } from "express";
import mongoose, { Schema } from "mongoose";
import { z } from "zod";
import { User, Company, Member } from "./models";
import {
  auth,
  role,
  verified,
  member,
  hash,
  token,
  HttpError,
  type AuthRequest,
} from "./shared";
import { queueMail, requireEmail } from "./mailer";
import { config } from "./config";
const schema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true },
    email: { type: String, required: true },
    role: { type: String, required: true },
    tokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    createdBy: Schema.Types.ObjectId,
  },
  { timestamps: true },
);
schema.index({ companyId: 1, email: 1 }, { unique: true });
schema.index({ tokenHash: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Invitation =
  mongoose.models.Invitation || mongoose.model("Invitation", schema);
const id = z.string().regex(/^[a-f0-9]{24}$/i),
  memberRole = z.enum(["hr_manager", "recruiter", "hiring_manager"]);
export const teamRouter = Router();
teamRouter.use(auth, role("recruiter"), verified);
teamRouter.post("/accept", async (req: AuthRequest, res) => {
  const data = z
    .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict()
    .parse(req.body);
  await mongoose.connection.transaction(async (session) => {
    const invite = await Invitation.findOne({
      tokenHash: hash(data.token),
      email: req.actor!.email,
      expiresAt: { $gt: new Date() },
    }).session(session);
    if (!invite)
      throw new HttpError(
        400,
        "Invalid or expired invitation. Sign in with the invited email address.",
      );
    const c = await Company.findOneAndUpdate(
      { _id: invite.companyId, status: { $ne: "suspended" } },
      { $inc: { __v: 1 } },
      { session },
    );
    if (!c) throw new HttpError(403, "This company is unavailable.");
    const u = await User.findOneAndUpdate(
      { _id: req.actor!.id, status: "active", verified: true },
      { $inc: { schedulingRevision: 1 } },
      { session },
    );
    if (!u) throw new HttpError(403, "Account unavailable.");
    if (await Member.exists({ userId: req.actor!.id }).session(session))
      throw new HttpError(409, "You already belong to a company.");
    await Member.create(
      [{ userId: req.actor!.id, companyId: c._id, role: invite.role }],
      { session },
    );
    await Invitation.deleteOne({ _id: invite._id }, { session });
  });
  res.json({
    message: "Invitation accepted. Your company workspace is ready.",
  });
});
teamRouter.use(member);
async function access(req: AuthRequest, session?: any, ownerOnly = false) {
  const m = await Member.findOne({
    userId: req.actor!.id,
    companyId: req.membership!.companyId,
  }).session(session || null);
  if (!m || !(ownerOnly ? ["owner"] : ["owner", "hr_manager"]).includes(m.role))
    throw new HttpError(403, "Your company role cannot manage team members.");
  const c = await Company.findOneAndUpdate(
    { _id: m.companyId, status: { $ne: "suspended" } },
    { $inc: { __v: 1 } },
    { session, new: true },
  );
  if (!c) throw new HttpError(403, "This company is unavailable.");
  return c;
}
teamRouter.get("/", async (req: AuthRequest, res) => {
  if (!["owner", "hr_manager"].includes(req.membership!.role))
    throw new HttpError(
      403,
      "Only the owner and HR managers can view team members.",
    );
  const members = await Member.find({ companyId: req.membership!.companyId })
    .sort({ _id: 1 })
    .lean();
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } })
    .select("name email status")
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const invitations = await Invitation.find({
    companyId: req.membership!.companyId,
    expiresAt: { $gt: new Date() },
  })
    .select("email role expiresAt")
    .lean();
  res.json({
    members: members.map((m) => ({ ...m, user: byId.get(String(m.userId)) })),
    invitations,
    canEdit: req.membership!.role === "owner",
  });
});
teamRouter.post("/invitations", async (req: AuthRequest, res) => {
  const d = z
    .object({ email: z.email().toLowerCase(), role: memberRole })
    .strict()
    .parse(req.body);
  requireEmail();
  const raw = token();
  await mongoose.connection.transaction(async (session) => {
    const c = await access(req, session, true);
    const u = await User.findOne({ email: d.email }).session(session);
    if (
      u &&
      (u.role !== "recruiter" ||
        (await Member.exists({ userId: u._id }).session(session)))
    )
      throw new HttpError(
        409,
        "This email cannot join another company workspace.",
      );
    await Invitation.findOneAndUpdate(
      { companyId: c._id, email: d.email },
      {
        $set: {
          role: d.role,
          tokenHash: hash(raw),
          expiresAt: new Date(Date.now() + 7 * 86400000),
          createdBy: req.actor!.id,
        },
      },
      { upsert: true, session },
    );
    const url = `${config.APP_URL}/accept-invitation?token=${raw}`;
    await queueMail(
      {
        to: d.email,
        subject: `Join ${c.name} on CrewUp`,
        text: `You have been invited as ${d.role}. Sign in or register as a recruiter with this email, verify your account, then accept: ${url} . This link expires in 7 days.`,
        url,
      },
      session,
    );
  });
  res
    .status(201)
    .json({
      message:
        "Invitation queued. Any previous invitation link for this email is now invalid.",
    });
});
teamRouter.delete("/invitations/:id", async (req: AuthRequest, res) => {
  await mongoose.connection.transaction(async (session) => {
    await access(req, session, true);
    const r = await Invitation.deleteOne(
      { _id: id.parse(req.params.id), companyId: req.membership!.companyId },
      { session },
    );
    if (!r.deletedCount) throw new HttpError(404, "Invitation not found.");
  });
  res.json({ message: "Invitation revoked." });
});
teamRouter.patch("/members/:id", async (req: AuthRequest, res) => {
  const d = z
    .object({ role: memberRole, version: z.number().int().min(0) })
    .strict()
    .parse(req.body);
  await mongoose.connection.transaction(async (session) => {
    await access(req, session, true);
    const m = await Member.findOne({
      _id: id.parse(req.params.id),
      companyId: req.membership!.companyId,
    }).session(session);
    if (!m) throw new HttpError(404, "Member not found.");
    if (m.role === "owner")
      throw new HttpError(403, "The owner role cannot be changed.");
    if (m.__v !== d.version)
      throw new HttpError(409, "Member changed. Refresh and try again.");
    m.role = d.role;
    m.__v++;
    await m.save({ session });
  });
  res.json({ message: "Member role updated." });
});
teamRouter.delete("/members/:id", async (req: AuthRequest, res) => {
  await mongoose.connection.transaction(async (session) => {
    await access(req, session, true);
    const m = await Member.findOne({
      _id: id.parse(req.params.id),
      companyId: req.membership!.companyId,
    }).session(session);
    if (!m) throw new HttpError(404, "Member not found.");
    if (m.role === "owner")
      throw new HttpError(403, "The owner cannot be removed.");
    await Member.deleteOne({ _id: m._id }, { session });
    await User.updateOne(
      { _id: m.userId },
      { $inc: { schedulingRevision: 1 } },
      { session },
    );
  });
  res.json({ message: "Member removed. Company access has ended." });
});
