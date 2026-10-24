import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Interview } from "./day3-models";
import { Application } from "./hiring-models";
import { User, Company, Member } from "./models";
import { auth, verified, HttpError, type AuthRequest } from "./shared";
import { recordId } from "./candidate";
import { notify } from "./notifications";
import { nextStages, stages, stageLabel } from "@crewup/shared/hiring";
const timeZone = z
  .string()
  .max(100)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid timezone.");
const details = z
  .object({
    title: z.string().trim().min(3).max(120),
    startsAt: z.iso.datetime(),
    durationMinutes: z.number().int().min(15).max(240),
    timeZone,
    meetingUrl: z
      .string()
      .max(500)
      .refine(
        (v) => !v || (URL.canParse(v) && new URL(v).protocol === "https:"),
        "Use a secure HTTPS meeting link.",
      )
      .default(""),
    location: z.string().trim().max(300).default(""),
    instructions: z.string().trim().max(2000).default(""),
  })
  .strict()
  .refine(
    (v) => !!(v.meetingUrl || v.location),
    "Add a meeting link or interview location.",
  )
  .refine(
    (v) => new Date(v.startsAt).getTime() > Date.now() + 60000,
    "Schedule at least one minute in the future.",
  );
async function scope(req: AuthRequest, write = false) {
  if (req.actor!.role === "applicant" && !write)
    return { candidateId: req.actor!.id };
  if (req.actor!.role !== "recruiter")
    throw new HttpError(403, "Recruiter access is required.");
  const m = await Member.findOne({ userId: req.actor!.id });
  if (!m || !(await Company.exists({ _id: m.companyId, status: "verified" })))
    throw new HttpError(403, "An approved company workspace is required.");
  if (write && !["owner", "hr_manager", "recruiter"].includes(m.role))
    throw new HttpError(403, "Your workspace role has read-only access.");
  return { companyId: String(m.companyId) };
}
async function locks(
  companyId: any,
  candidateId: any,
  organizerId: any,
  session: mongoose.ClientSession,
) {
  if (
    !(await Company.findOneAndUpdate(
      { _id: companyId, status: "verified" },
      { $inc: { __v: 1 } },
      { session, timestamps: false },
    ))
  )
    throw new HttpError(403, "Company is not approved.");
  for (const id of [String(candidateId), String(organizerId)].sort())
    if (
      !(await User.findOneAndUpdate(
        { _id: id, status: "active" },
        { $inc: { schedulingRevision: 1 } },
        { session, timestamps: false },
      ))
    )
      throw new HttpError(409, "An interview participant is unavailable.");
}
async function conflicts(
  candidateId: any,
  organizerId: any,
  start: Date,
  end: Date,
  exclude: any,
  session: mongoose.ClientSession,
) {
  if (
    await Interview.exists({
      status: "scheduled",
      ...(exclude ? { _id: { $ne: exclude } } : {}),
      startsAt: { $lt: end },
      endsAt: { $gt: start },
      $or: [{ candidateId }, { organizerId }],
    }).session(session)
  )
    throw new HttpError(
      409,
      "The candidate or organizer already has an interview during that time.",
    );
}
export async function cancelInterviews(
  application: any,
  reason: string,
  session: mongoose.ClientSession,
) {
  const rows = await Interview.find({
    applicationId: application._id,
    status: "scheduled",
  }).session(session);
  for (const i of rows) {
    await Interview.updateOne(
      { _id: i._id },
      {
        $set: { status: "cancelled", cancellationReason: reason },
        $inc: { version: 1 },
      },
      { session },
    );
    await notify(
      i.candidateId,
      "Interview cancelled",
      `${i.title}: ${reason}`,
      "Interviews",
      session,
    );
    await notify(
      i.organizerId,
      "Interview cancelled",
      `${i.title}: ${reason}`,
      "Interviews",
      session,
    );
  }
}
export const interviewRouter = Router();
interviewRouter.use(auth, verified);
interviewRouter.get("/", async (req: AuthRequest, res) => {
  const filter = await scope(req);
  const cursor = req.query.cursor
    ? recordId.parse(req.query.cursor)
    : undefined;
  const status = req.query.status
    ? z.enum(["scheduled", "cancelled", "completed"]).parse(req.query.status)
    : undefined;
  const rows = await Interview.find({
    ...filter,
    ...(cursor ? { _id: { $lt: cursor } } : {}),
    ...(status ? { status } : {}),
  })
    .select(req.actor!.role === "recruiter" ? "+feedback" : "")
    .sort({ _id: -1 })
    .limit(51)
    .lean();
  const page = rows.slice(0, 50);
  const apps: any[] = await Application.find({
    _id: { $in: page.map((i) => i.applicationId) },
  })
    .select(
      "snapshot.candidate.name snapshot.job.title snapshot.project.name stage status version",
    )
    .lean();
  const m =
    req.actor!.role === "recruiter"
      ? await Member.findOne({ userId: req.actor!.id })
      : null;
  res.json({
    interviews: page.map((i) => ({
      ...i,
      application: apps.find((a) => String(a._id) === String(i.applicationId)),
    })),
    nextCursor: rows.length > 50 ? String(page.at(-1)!._id) : null,
    canManage: !!m && ["owner", "hr_manager", "recruiter"].includes(m.role),
  });
});
interviewRouter.post("/", async (req: AuthRequest, res) => {
  const filter = await scope(req, true);
  const body = z
    .object({
      applicationId: recordId,
      version: z.number().int().min(0),
      stage: z.enum(["interview", "final_interview"]),
      details,
    })
    .strict()
    .parse(req.body);
  let interview: any;
  await mongoose.connection.transaction(async (session) => {
    const app = await Application.findOne({
      _id: body.applicationId,
      ...filter,
    }).session(session);
    if (!app) throw new HttpError(404, "Application not found.");
    await locks(app.companyId, app.userId, req.actor!.id, session);
    if (
      app.status !== "active" ||
      !["applied", "screening", "interview", "final_interview"].includes(
        app.stage,
      ) ||
      (app.stage !== body.stage && !nextStages(app.stage).includes(body.stage))
    )
      throw new HttpError(
        422,
        "This application cannot be scheduled for that interview stage.",
      );
    if (app.version !== body.version)
      throw new HttpError(
        409,
        "Application changed. Refresh and review it again.",
      );
    if (
      await Interview.exists({
        applicationId: app._id,
        status: "scheduled",
      }).session(session)
    )
      throw new HttpError(
        409,
        "This application already has a scheduled interview. Reschedule or cancel it first.",
      );
    const start = new Date(body.details.startsAt),
      end = new Date(start.getTime() + body.details.durationMinutes * 60000);
    await conflicts(app.userId, req.actor!.id, start, end, null, session);
    const history =
      app.stage !== body.stage
        ? {
            $push: {
              history: {
                stage: body.stage,
                at: new Date(),
                actorId: req.actor!.id,
              },
            },
          }
        : {};
    await Application.updateOne(
      { _id: app._id, version: body.version },
      { $set: { stage: body.stage }, $inc: { version: 1 }, ...history },
      { session },
    );
    [interview] = await Interview.create(
      [
        {
          ...body.details,
          startsAt: start,
          endsAt: end,
          applicationId: app._id,
          companyId: app.companyId,
          candidateId: app.userId,
          organizerId: req.actor!.id,
        },
      ],
      { session },
    );
    const when = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: body.details.timeZone,
    }).format(start);
    await notify(
      app.userId,
      "Interview scheduled",
      `${body.details.title} for ${app.snapshot.job.title}: ${when} (${body.details.timeZone}). Open Interviews for the link and details.`,
      "Interviews",
      session,
    );
    await notify(
      req.actor!.id,
      "Interview scheduled",
      `${body.details.title} with ${app.snapshot.candidate.name}.`,
      "Interviews",
      session,
    );
  });
  res.status(201).json({ interview });
});
interviewRouter.patch("/:id", async (req: AuthRequest, res) => {
  const filter = await scope(req, true);
  const body = z
    .object({ version: z.number().int().min(0), details })
    .strict()
    .parse(req.body);
  await mongoose.connection.transaction(async (session) => {
    const i = await Interview.findOne({
      _id: recordId.parse(req.params.id),
      ...filter,
    }).session(session);
    if (!i) throw new HttpError(404, "Interview not found.");
    await locks(i.companyId, i.candidateId, i.organizerId, session);
    const app = await Application.findOne({
      _id: i.applicationId,
      status: "active",
      stage: { $in: ["interview", "final_interview"] },
    }).session(session);
    if (!app || i.status !== "scheduled")
      throw new HttpError(
        422,
        "Only active scheduled interviews can be changed.",
      );
    if (i.version !== body.version)
      throw new HttpError(409, "Interview changed. Refresh and try again.");
    const start = new Date(body.details.startsAt),
      end = new Date(start.getTime() + body.details.durationMinutes * 60000);
    await conflicts(i.candidateId, i.organizerId, start, end, i._id, session);
    await Application.updateOne(
      { _id: app._id },
      { $inc: { version: 1 } },
      { session },
    );
    await Interview.updateOne(
      { _id: i._id },
      {
        $set: { ...body.details, startsAt: start, endsAt: end },
        $inc: { version: 1 },
      },
      { session },
    );
    await notify(
      i.candidateId,
      "Interview rescheduled",
      `${body.details.title} has new details. Check the updated date and time in Interviews.`,
      "Interviews",
      session,
    );
    await notify(
      i.organizerId,
      "Interview rescheduled",
      `${body.details.title} has been updated.`,
      "Interviews",
      session,
    );
  });
  res.json({ ok: true });
});
interviewRouter.patch("/:id/cancel", async (req: AuthRequest, res) => {
  const filter = await scope(req, true);
  const body = z
    .object({
      version: z.number().int().min(0),
      reason: z.string().trim().min(5).max(500),
    })
    .strict()
    .parse(req.body);
  await mongoose.connection.transaction(async (session) => {
    const i = await Interview.findOne({
      _id: recordId.parse(req.params.id),
      ...filter,
    }).session(session);
    if (!i) throw new HttpError(404, "Interview not found.");
    await locks(i.companyId, i.candidateId, i.organizerId, session);
    if (i.version !== body.version || i.status !== "scheduled")
      throw new HttpError(409, "Interview changed or is no longer scheduled.");
    await Interview.updateOne(
      { _id: i._id },
      {
        $set: { status: "cancelled", cancellationReason: body.reason },
        $inc: { version: 1 },
      },
      { session },
    );
    await Application.updateOne(
      { _id: i.applicationId },
      { $inc: { version: 1 } },
      { session },
    );
    await notify(
      i.candidateId,
      "Interview cancelled",
      `${i.title}: ${body.reason}`,
      "Interviews",
      session,
    );
    await notify(
      i.organizerId,
      "Interview cancelled",
      `${i.title}: ${body.reason}`,
      "Interviews",
      session,
    );
  });
  res.json({ ok: true });
});
interviewRouter.patch("/:id/feedback", async (req: AuthRequest, res) => {
  const filter = await scope(req, true);
  const body = z
    .object({
      version: z.number().int().min(0),
      outcome: z.enum(["moved_forward", "rejected"]),
      feedback: z.string().trim().min(10).max(4000),
    })
    .strict()
    .parse(req.body);
  await mongoose.connection.transaction(async (session) => {
    const i = await Interview.findOne({
      _id: recordId.parse(req.params.id),
      ...filter,
    }).session(session);
    if (!i) throw new HttpError(404, "Interview not found.");
    await locks(i.companyId, i.candidateId, i.organizerId, session);
    if (
      i.version !== body.version ||
      i.status !== "scheduled" ||
      i.outcome !== "pending"
    )
      throw new HttpError(
        409,
        "Feedback has already been recorded or the interview changed.",
      );
    if (i.endsAt > new Date())
      throw new HttpError(
        422,
        "Record feedback after the scheduled interview has ended.",
      );
    const app = await Application.findOne({
      _id: i.applicationId,
      status: "active",
      stage: { $in: ["interview", "final_interview"] },
    }).session(session);
    if (!app)
      throw new HttpError(
        422,
        "The application is no longer at an active interview stage.",
      );
    const stage =
      body.outcome === "rejected"
        ? "rejected"
        : stages[stages.indexOf(app.stage) + 1];
    await Interview.updateOne(
      { _id: i._id },
      {
        $set: {
          status: "completed",
          outcome: body.outcome,
          feedback: body.feedback,
        },
        $inc: { version: 1 },
      },
      { session },
    );
    await Application.updateOne(
      { _id: app._id },
      {
        $set: { stage },
        $inc: { version: 1 },
        $push: { history: { stage, at: new Date(), actorId: req.actor!.id } },
      },
      { session },
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
});
const escapeICS = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
interviewRouter.get("/:id/calendar", async (req: AuthRequest, res) => {
  const filter = await scope(req);
  const i = await Interview.findOne({
    _id: recordId.parse(req.params.id),
    ...filter,
  });
  if (!i) throw new HttpError(404, "Interview not found.");
  const text = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CrewUp//Interviews//EN",
    "BEGIN:VEVENT",
    `UID:${i.id}@crewup`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(i.startsAt)}`,
    `DTEND:${stamp(i.endsAt)}`,
    `SEQUENCE:${i.version}`,
    `SUMMARY:${escapeICS(i.title)}`,
    `DESCRIPTION:${escapeICS(i.instructions || "")}`,
    `LOCATION:${escapeICS(i.meetingUrl || i.location || "")}`,
    `STATUS:${i.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  res
    .set({
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="crewup-interview.ics"',
    })
    .send(text);
});
