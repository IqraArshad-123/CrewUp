import nodemailer from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import { MailJob } from "./day3-models";
import { config } from "./config";
import { HttpError } from "./shared";
export function emailReady() {
  return config.MAIL_MODE === "smtp"
    ? !!(config.SMTP_HOST && config.SMTP_FROM)
    : !config.production;
}
export function requireEmail() {
  if (!emailReady())
    throw new HttpError(
      503,
      "Email delivery is not configured. Please contact the administrator.",
    );
}
const transport = () =>
  nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    requireTLS: !config.SMTP_SECURE,
    auth: config.SMTP_USER
      ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 20000,
  });
export async function queueMail(
  data: {
    dedupeKey?: string;
    to: string;
    subject: string;
    text: string;
    url?: string;
    localKind?: string;
  },
  session?: any,
) {
  const [job] = await MailJob.create([data], session ? { session } : {});
  return job;
}
let running = false;
export async function processMail(limit = 20) {
  if (running || !emailReady()) return;
  running = true;
  try {
    for (let n = 0; n < limit; n++) {
      const job = await MailJob.findOneAndUpdate(
        {
          $or: [
            { status: "pending", nextAttempt: { $lte: new Date() } },
            { status: "processing", leaseUntil: { $lt: new Date() } },
          ],
        },
        {
          $set: {
            status: "processing",
            leaseUntil: new Date(Date.now() + 60000),
          },
          $inc: { attempts: 1 },
        },
        { new: true, sort: { createdAt: 1 } },
      ).select("+to +text +url +localKind");
      if (!job) break;
      try {
        if (config.MAIL_MODE === "local") {
          await mkdir(`${config.MAIL_DIR}/events`, { recursive: true });
          const body = JSON.stringify(
            { to: job.to, subject: job.subject, text: job.text, url: job.url },
            null,
            2,
          );
          await writeFile(`${config.MAIL_DIR}/events/${job.id}.json`, body);
          if (job.localKind)
            await writeFile(
              `${config.MAIL_DIR}/${job.to.replace(/[^a-z0-9@._-]/g, "_")}${job.localKind === "reset" ? ".reset" : ""}.json`,
              body,
            );
        } else
          await transport().sendMail({
            from: config.SMTP_FROM,
            to: job.to,
            subject: job.subject,
            text: job.text,
            messageId: `<${job.id}@crewup.mail>`,
          });
        await MailJob.updateOne(
          { _id: job._id },
          {
            $set: { status: "sent", sentAt: new Date() },
            $unset: {
              to: 1,
              text: 1,
              url: 1,
              localKind: 1,
              leaseUntil: 1,
              lastError: 1,
            },
          },
        );
      } catch {
        await MailJob.updateOne(
          { _id: job._id },
          {
            $set: {
              status: job.attempts >= 5 ? "failed" : "pending",
              nextAttempt: new Date(
                Date.now() + Math.min(3600000, 30000 * 2 ** job.attempts),
              ),
              lastError:
                "Delivery failed; check provider configuration and connectivity.",
            },
            $unset: { leaseUntil: 1 },
          },
        );
      }
    }
  } finally {
    running = false;
  }
}
export function startMailWorker() {
  void processMail().catch(() => console.error("Mail worker unavailable."));
  const timer = setInterval(
    () =>
      void processMail().catch(() => console.error("Mail worker unavailable.")),
    15000,
  );
  timer.unref();
  return () => clearInterval(timer);
}
