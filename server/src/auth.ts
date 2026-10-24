import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import mongoose from "mongoose";
import { queueMail, requireEmail, processMail } from "./mailer";
import { User, Session } from "./models";
import { config } from "./config";
import {
  auth,
  hash,
  token,
  HttpError,
  issueSession,
  setTokens,
  cookie,
  type AuthRequest,
} from "./shared";
export const authRouter = Router();
authRouter.get("/development-mail", auth, async (req: AuthRequest, res) => {
  if (config.production) throw new HttpError(404, "Endpoint not found.");
  if (req.actor!.verified)
    throw new HttpError(409, "Your email is already verified.");
  const filename = req.actor!.email.replace(/[^a-z0-9@._-]/g, "_");
  try {
    const mail = JSON.parse(
      await readFile(`${config.MAIL_DIR}/${filename}.json`, "utf8"),
    );
    res.json({ subject: mail.subject, url: mail.url });
  } catch {
    throw new HttpError(
      404,
      "No local message found. Please resend verification.",
    );
  }
});
const password = z
  .string()
  .min(10)
  .max(72)
  .refine(
    (s) => Buffer.byteLength(s) <= 72,
    "Password must be at most 72 bytes.",
  );
const email = z.email().trim().toLowerCase();
async function verification(u: { email: string; _id: unknown }) {
  requireEmail();
  const code = token();
  const url = `${config.APP_URL}/verify?token=${code}`;
  await mongoose.connection.transaction(async (session) => {
    await User.updateOne(
      { _id: u._id },
      {
        $set: {
          verificationHash: hash(code),
          verificationExpires: new Date(Date.now() + 3600000),
        },
      },
      { session },
    );
    await queueMail(
      {
        to: u.email,
        subject: "Verify your CrewUp email",
        text: `Verify your email within one hour: ${url}`,
        url,
        localKind: "verify",
      },
      session,
    );
  });
  if (config.MAIL_MODE === "local") await processMail();
}
authRouter.post("/register", async (req, res) => {
  requireEmail();
  const data = z
    .object({
      name: z.string().trim().min(2).max(80),
      email,
      password,
      role: z.enum(["applicant", "recruiter"]),
    })
    .strict()
    .parse(req.body);
  const user = await User.create({
    ...data,
    password: undefined,
    passwordHash: await bcrypt.hash(data.password, 12),
  });
  await verification(user);
  await issueSession(res, String(user._id), user.role);
  res.status(201).json({
    message:
      config.MAIL_MODE === "local"
        ? "Account created. Open the local test email to verify your account."
        : "Account created. Check your email to verify your account.",
  });
});
authRouter.post("/login", async (req, res) => {
  const data = z
    .object({ email, password: z.string().min(1).max(200) })
    .parse(req.body);
  const u = await User.findOne({ email: data.email }).select("+passwordHash");
  const valid = await bcrypt.compare(
    data.password,
    u?.passwordHash ||
      "$2b$12$Q9NtN3DVuVrwjU2HR26BGeq6.uDuHLbRggdCOvDE2NKDUUoGtaYQi",
  );
  if (!u || !valid) throw new HttpError(401, "Email or password is incorrect.");
  if (u.status !== "active")
    throw new HttpError(403, "This account is suspended.");
  await issueSession(res, String(u._id), u.role, u.authVersion || 0);
  res.json({ message: "Welcome back." });
});
authRouter.get("/me", auth, (req: AuthRequest, res) =>
  res.json({ user: req.actor }),
);
authRouter.post("/verify", async (req, res) => {
  const { token: code } = z
    .object({ token: z.string().length(64) })
    .parse(req.body);
  const u = await User.findOneAndUpdate(
    {
      verificationHash: hash(code),
      verificationExpires: { $gt: new Date() },
      status: "active",
      verified: false,
    },
    {
      $set: { verified: true },
      $unset: { verificationHash: 1, verificationExpires: 1 },
    },
    { new: true },
  );
  if (!u)
    throw new HttpError(
      400,
      "This verification link is invalid or has expired.",
    );
  res.json({ message: "Email verified. Your workspace is ready." });
});
authRouter.post("/resend", auth, async (req: AuthRequest, res) => {
  requireEmail();
  if (!req.actor!.verified)
    await verification({ _id: req.actor!.id, email: req.actor!.email });
  res.json({
    message:
      config.MAIL_MODE === "local"
        ? "A new verification message is in the local test inbox."
        : "A verification email has been queued.",
  });
});
authRouter.post("/refresh", async (req, res) => {
  const old = req.cookies.crewup_refresh;
  if (typeof old !== "string")
    throw new HttpError(401, "Please sign in again.");
  const refresh = token();
  const session = await Session.findOneAndUpdate(
    { refreshHash: hash(old), expiresAt: { $gt: new Date() } },
    {
      $set: {
        refreshHash: hash(refresh),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    },
    { new: true },
  );
  if (!session)
    throw new HttpError(401, "Session expired. Please sign in again.");
  const u = await User.findById(session.userId);
  if (
    !u ||
    u.status !== "active" ||
    (u.authVersion || 0) !== (session.authVersion || 0)
  ) {
    await session.deleteOne();
    throw new HttpError(401, "Session is no longer active.");
  }
  setTokens(res, String(u._id), u.role, String(session._id), refresh);
  res.json({ ok: true });
});
authRouter.post("/logout", async (req, res) => {
  if (req.cookies.crewup_refresh)
    await Session.deleteOne({ refreshHash: hash(req.cookies.crewup_refresh) });
  cookie(res, "crewup_access", "", 0);
  cookie(res, "crewup_refresh", "", 0);
  res.json({ ok: true });
});

authRouter.post("/forgot-password", async (req, res) => {
  requireEmail();
  const data = z.object({ email }).strict().parse(req.body);
  const u = await User.findOne({ email: data.email, status: "active" });
  if (u) {
    const code = token();
    const url = `${config.APP_URL}/reset-password?token=${code}`;
    await mongoose.connection.transaction(async (session) => {
      await User.updateOne(
        { _id: u._id },
        {
          $set: {
            resetHash: hash(code),
            resetExpires: new Date(Date.now() + 1800000),
          },
        },
        { session },
      );
      await queueMail(
        {
          to: u.email,
          subject: "Reset your CrewUp password",
          text: `Reset your password within 30 minutes: ${url}\nIf you did not request this, ignore this message.`,
          url,
          localKind: "reset",
        },
        session,
      );
    });
    if (config.MAIL_MODE === "local") await processMail();
  }
  res.json({
    message:
      "If an active account matches that email, a reset message will be sent.",
  });
});
authRouter.post("/reset-password", async (req, res) => {
  const data = z
    .object({ token: z.string().length(64), password })
    .strict()
    .parse(req.body);
  const passwordHash = await bcrypt.hash(data.password, 12);
  await mongoose.connection.transaction(async (session) => {
    const u = await User.findOneAndUpdate(
      {
        resetHash: hash(data.token),
        resetExpires: { $gt: new Date() },
        status: "active",
      },
      {
        $set: { passwordHash },
        $inc: { authVersion: 1 },
        $unset: { resetHash: 1, resetExpires: 1 },
      },
      { new: true, session },
    );
    if (!u)
      throw new HttpError(
        400,
        "This reset link is invalid or expired. Request a new link.",
      );
    await Session.deleteMany({ userId: u._id }, { session });
  });
  cookie(res, "crewup_access", "", 0);
  cookie(res, "crewup_refresh", "", 0);
  res.json({ message: "Password updated. Sign in again on all devices." });
});
