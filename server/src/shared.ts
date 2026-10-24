import type { Request, Response, NextFunction } from "express";
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "./config";
import { User, Session, Member } from "./models";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const token = () => randomBytes(32).toString("hex");
export interface AuthRequest extends Request {
  actor?: {
    id: string;
    name: string;
    email: string;
    role: string;
    verified: boolean;
  };
  membership?: { companyId: string; role: string };
  sessionId?: string;
}
export function cookie(
  res: Response,
  name: string,
  value: string,
  maxAge: number,
) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: config.production,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}
export async function issueSession(
  res: Response,
  userId: string,
  role: string,
  expectedVersion?: number,
) {
  const user = await User.findById(userId);
  if (
    !user ||
    user.status !== "active" ||
    (expectedVersion !== undefined &&
      (user.authVersion || 0) !== expectedVersion)
  )
    throw new HttpError(401, "Please sign in again.");
  const refresh = token();
  const session = await Session.create({
    userId,
    authVersion: expectedVersion ?? user.authVersion ?? 0,
    refreshHash: hash(refresh),
    expiresAt: new Date(Date.now() + 7 * 86400000),
  });
  setTokens(res, userId, role, String(session._id), refresh);
}
export function setTokens(
  res: Response,
  userId: string,
  role: string,
  sid: string,
  refresh: string,
) {
  cookie(
    res,
    "crewup_access",
    jwt.sign({ sub: userId, role, sid }, config.JWT_SECRET, {
      expiresIn: "15m",
      issuer: "crewup",
      audience: "crewup-web",
    }),
    900000,
  );
  cookie(res, "crewup_refresh", refresh, 7 * 86400000);
}
export async function auth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) {
  try {
    const payload = jwt.verify(
      req.cookies.crewup_access || "",
      config.JWT_SECRET,
      { issuer: "crewup", audience: "crewup-web" },
    ) as jwt.JwtPayload;
    const [u, s] = await Promise.all([
      User.findById(payload.sub),
      Session.findOne({
        _id: payload.sid,
        userId: payload.sub,
        expiresAt: { $gt: new Date() },
      }),
    ]);
    if (
      !u ||
      !s ||
      u.status !== "active" ||
      (u.authVersion || 0) !== (s.authVersion || 0)
    )
      throw new Error();
    req.actor = {
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role,
      verified: u.verified,
    };
    req.sessionId = payload.sid;
    next();
  } catch {
    next(new HttpError(401, "Please sign in to continue."));
  }
}
export const role =
  (...roles: string[]) =>
  (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.actor || !roles.includes(req.actor.role))
      return next(
        new HttpError(403, "You do not have permission for this action."),
      );
    next();
  };
export async function member(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) {
  const m = await Member.findOne({ userId: req.actor!.id });
  if (!m) throw new HttpError(403, "Create a company workspace first.");
  req.membership = { companyId: String(m.companyId), role: m.role };
  next();
}
export function verified(req: AuthRequest, _res: Response, next: NextFunction) {
  if (!req.actor!.verified)
    throw new HttpError(403, "Verify your email before continuing.");
  next();
}
export function canPost(req: AuthRequest, _res: Response, next: NextFunction) {
  if (!["owner", "hr_manager", "recruiter"].includes(req.membership!.role))
    throw new HttpError(
      403,
      "Your company role cannot manage projects or jobs.",
    );
  next();
}
