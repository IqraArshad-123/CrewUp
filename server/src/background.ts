import { PDFParse } from "pdf-parse";
import { Resume, Application } from "./hiring-models";
import { User, Member, Company } from "./models";
import { MailJob } from "./day3-models";
import { readPrivate } from "./storage";
import { config } from "./config";
import { queueMail } from "./mailer";
export async function processResumes(limit = 10) {
  for (let n = 0; n < limit; n++) {
    const r = await Resume.findOneAndUpdate(
      {
        $and: [
          {
            $or: [
              { processingAttempts: { $lt: 5 } },
              { processingAttempts: { $exists: false } },
            ],
          },
          {
            $or: [
              { processingNextAttempt: { $lte: new Date() } },
              { processingNextAttempt: { $exists: false } },
            ],
          },
        ],
        $or: [
          { processingStatus: "pending" },
          {
            processingStatus: "processing",
            processingLease: { $lt: new Date() },
          },
          { processingStatus: { $exists: false } },
        ],
      },
      {
        $set: {
          processingStatus: "processing",
          processingLease: new Date(Date.now() + 300000),
        },
        $inc: { processingAttempts: 1 },
      },
      { new: true, sort: { _id: 1 } },
    ).select("+storageKey");
    if (!r) break;
    let parser: PDFParse | undefined;
    try {
      const bytes = await readPrivate(r.storage, r.storageKey);
      parser = new PDFParse({
        data: new Uint8Array(bytes),
        isEvalSupported: false,
      });
      const result = await parser.getText();
      await Resume.updateOne(
        { _id: r._id, processingAttempts: r.processingAttempts },
        {
          $set: {
            processingStatus: "ready",
            pageCount: result.total,
            wordCount: result.pages
              .map((p) => p.text)
              .join(" ")
              .trim()
              .split(/\s+/)
              .filter(Boolean).length,
            processedAt: new Date(),
          },
          $unset: { processingLease: 1, processingError: 1 },
        },
      );
    } catch {
      await Resume.updateOne(
        { _id: r._id, processingAttempts: r.processingAttempts },
        {
          $set: {
            processingStatus: r.processingAttempts >= 5 ? "failed" : "pending",
            processingError:
              "PDF text processing failed. Original CV remains available.",
            processingNextAttempt: new Date(
              Date.now() + Math.min(3600000, 30000 * 2 ** r.processingAttempts),
            ),
          },
          $unset: { processingLease: 1 },
        },
      );
    } finally {
      await parser?.destroy().catch(() => {});
    }
  }
}
export async function recruiterDigests(now = new Date()) {
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  const start = new Date(day.getTime() - 86400000);
  const counts = await Application.aggregate([
    { $match: { createdAt: { $gte: start, $lt: day } } },
    { $group: { _id: "$companyId", count: { $sum: 1 } } },
  ]);
  const companies = await Company.find({
    _id: { $in: counts.map((c) => c._id) },
    status: "verified",
  })
    .select("_id")
    .lean();
  const allowed = companies.map((c) => c._id);
  const members = Member.find({ companyId: { $in: allowed } }).cursor();
  let queued = 0;
  for await (const m of members) {
    const u = await User.findOne({
      _id: m.userId,
      verified: true,
      status: "active",
    });
    if (!u) continue;
    const key = `digest-${start.toISOString().slice(0, 10)}-${m.companyId}-${u._id}`;
    const count =
      counts.find((c) => String(c._id) === String(m.companyId))?.count || 0;
    try {
      await queueMail({
        dedupeKey: key,
        to: u.email,
        subject: "Your daily CrewUp hiring summary",
        text: `Your company received ${count} applications on ${start.toISOString().slice(0, 10)} (UTC). Review them privately: ${config.APP_URL}/dashboard?tab=Applications`,
      });
      queued++;
    } catch (e: any) {
      if (e.code !== 11000) throw e;
    }
  }
  return queued;
}
