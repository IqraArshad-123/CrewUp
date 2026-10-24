import mongoose, { Schema } from "mongoose";
const opts = { timestamps: true };
const interviewSchema = new Schema(
  {
    applicationId: { type: Schema.Types.ObjectId, required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },
    candidateId: { type: Schema.Types.ObjectId, required: true, index: true },
    organizerId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    timeZone: { type: String, required: true },
    meetingUrl: String,
    location: String,
    instructions: String,
    status: {
      type: String,
      enum: ["scheduled", "cancelled", "completed"],
      default: "scheduled",
    },
    outcome: {
      type: String,
      enum: ["pending", "moved_forward", "rejected"],
      default: "pending",
    },
    feedback: { type: String, select: false },
    version: { type: Number, default: 0 },
    cancellationReason: String,
  },
  opts,
);
interviewSchema.index(
  { applicationId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "scheduled" } },
);
interviewSchema.index({ companyId: 1, startsAt: 1 });
interviewSchema.index({ candidateId: 1, startsAt: 1 });
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    title: String,
    message: String,
    tab: String,
    readAt: Date,
  },
  opts,
);
notificationSchema.index({ userId: 1, _id: -1 });
const mailSchema = new Schema(
  {
    dedupeKey: { type: String },
    to: { type: String, required: true, select: false },
    subject: { type: String, required: true },
    text: { type: String, required: true, select: false },
    url: { type: String, select: false },
    localKind: { type: String, select: false },
    status: {
      type: String,
      enum: ["pending", "processing", "sent", "failed"],
      default: "pending",
    },
    attempts: { type: Number, default: 0 },
    nextAttempt: { type: Date, default: Date.now },
    leaseUntil: Date,
    sentAt: Date,
    lastError: String,
  },
  opts,
);
mailSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
mailSchema.index({ status: 1, nextAttempt: 1 });
mailSchema.index({ sentAt: 1 }, { expireAfterSeconds: 604800 });
export const Interview =
  mongoose.models.Interview || mongoose.model("Interview", interviewSchema);
export const Notification =
  mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);
export const MailJob =
  mongoose.models.MailJob || mongoose.model("MailJob", mailSchema);
export const day3Models = [Interview, Notification, MailJob];
