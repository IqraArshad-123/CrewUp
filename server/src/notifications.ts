import { Router } from "express";
import type { ClientSession } from "mongoose";
import { auth, HttpError, type AuthRequest } from "./shared";
import { Notification, MailJob } from "./day3-models";
import { User } from "./models";
import { recordId } from "./candidate";
import { config } from "./config";
export async function notify(
  userId: any,
  title: string,
  message: string,
  tab: string,
  session: ClientSession,
) {
  await Notification.create([{ userId, title, message, tab }], { session });
  const u = await User.findById(userId).session(session);
  if (u?.verified && u.status === "active")
    await MailJob.create(
      [
        {
          to: u.email,
          subject: `CrewUp: ${title}`,
          text: `${message}\n\nOpen your workspace: ${config.APP_URL}/dashboard?tab=${encodeURIComponent(tab)}`,
        },
      ],
      { session },
    );
}
export const notificationRouter = Router();
notificationRouter.use(auth);
notificationRouter.get("/", async (req: AuthRequest, res) => {
  const cursor = req.query.cursor
    ? recordId.parse(req.query.cursor)
    : undefined;
  const rows = await Notification.find({
    userId: req.actor!.id,
    ...(cursor ? { _id: { $lt: cursor } } : {}),
  })
    .sort({ _id: -1 })
    .limit(51)
    .lean();
  const page = rows.slice(0, 50);
  res.json({
    notifications: page,
    nextCursor: rows.length > 50 ? String(page.at(-1)!._id) : null,
    unread: await Notification.countDocuments({
      userId: req.actor!.id,
      readAt: null,
    }),
  });
});
notificationRouter.patch("/read-all", async (req: AuthRequest, res) => {
  await Notification.updateMany(
    { userId: req.actor!.id, readAt: null },
    { $set: { readAt: new Date() } },
  );
  res.json({ ok: true });
});
notificationRouter.patch("/:id/read", async (req: AuthRequest, res) => {
  const n = await Notification.findOneAndUpdate(
    { _id: recordId.parse(req.params.id), userId: req.actor!.id },
    { $set: { readAt: new Date() } },
  );
  if (!n) throw new HttpError(404, "Notification not found.");
  res.json({ ok: true });
});
