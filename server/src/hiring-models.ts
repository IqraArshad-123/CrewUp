import mongoose, { Schema } from "mongoose";
const opts = { timestamps: true };
const profileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, unique: true },
    headline: String,
    bio: String,
    skills: [String],
    location: String,
    portfolioUrl: String,
    availableFrom: String,
    availableUntil: String,
    savedJobIds: [Schema.Types.ObjectId],
    revision: { type: Number, default: 0 },
  },
  opts,
);
const resumeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    processingStatus: {
      type: String,
      enum: ["pending", "processing", "ready", "failed"],
      default: "pending",
    },
    processingAttempts: { type: Number, default: 0 },
    processingLease: Date,
    processingError: String,
    processingNextAttempt: { type: Date, default: Date.now },
    pageCount: Number,
    wordCount: Number,
    processedAt: Date,
    filename: { type: String, required: true },
    storageKey: { type: String, required: true, select: false },
    storage: { type: String, enum: ["local", "s3"], required: true },
    size: Number,
    sha256: String,
  },
  opts,
);
const uploadSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    filename: String,
    size: Number,
    storageKey: { type: String, select: false },
    resumeId: { type: Schema.Types.ObjectId, required: true },
    storage: { type: String, enum: ["local", "s3"], required: true },
    state: {
      type: String,
      enum: ["pending", "processing", "confirmed"],
      default: "pending",
    },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  opts,
);
const applicationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    companyId: { type: Schema.Types.ObjectId, required: true },
    projectId: { type: Schema.Types.ObjectId, required: true },
    jobId: { type: Schema.Types.ObjectId, required: true },
    resumeId: { type: Schema.Types.ObjectId, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true, immutable: true },
    coverLetter: { type: String, immutable: true },
    answers: { type: [Schema.Types.Mixed], immutable: true },
    stage: {
      type: String,
      enum: [
        "applied",
        "screening",
        "interview",
        "final_interview",
        "offer",
        "hired",
        "rejected",
      ],
      default: "applied",
    },
    status: { type: String, enum: ["active", "withdrawn"], default: "active" },
    history: [
      {
        _id: false,
        stage: String,
        at: Date,
        actorId: { type: Schema.Types.ObjectId, select: false },
      },
    ],
    notes: { type: String, default: "", select: false },
    version: { type: Number, default: 0 },
  },
  opts,
);
applicationSchema.index({ userId: 1, jobId: 1 }, { unique: true });
applicationSchema.index({ companyId: 1, _id: -1 });
applicationSchema.index({ userId: 1, _id: -1 });
applicationSchema.index({ projectId: 1, stage: 1 });
export const Profile =
  mongoose.models.Profile || mongoose.model("Profile", profileSchema);
export const Resume =
  mongoose.models.Resume || mongoose.model("Resume", resumeSchema);
export const Upload =
  mongoose.models.Upload || mongoose.model("Upload", uploadSchema);
export const Application =
  mongoose.models.Application ||
  mongoose.model("Application", applicationSchema);
export const hiringModels = [Profile, Resume, Upload, Application];
