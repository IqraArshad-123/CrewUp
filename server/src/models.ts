import mongoose, { Schema } from "mongoose";
const opts = { timestamps: true };
const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    authVersion: { type: Number, default: 0 },
    role: {
      type: String,
      enum: ["applicant", "recruiter", "admin"],
      required: true,
    },
    verified: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "suspended"], default: "active" },
    verificationHash: { type: String, select: false },
    verificationExpires: Date,
    resetHash: { type: String, select: false },
    resetExpires: { type: Date, select: false },
    schedulingRevision: { type: Number, default: 0, select: false },
  },
  opts,
);
const companySchema = new Schema(
  {
    name: { type: String, required: true },
    description: String,
    website: String,
    industry: String,
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["pending", "verified", "suspended"],
      default: "pending",
    },
  },
  opts,
);
const memberSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, unique: true },
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },
    role: {
      type: String,
      enum: ["owner", "hr_manager", "recruiter", "hiring_manager"],
      required: true,
    },
  },
  opts,
);
const projectSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    category: String,
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    location: String,
    workMode: {
      type: String,
      enum: ["remote", "hybrid", "onsite"],
      default: "remote",
    },
    status: { type: String, enum: ["active", "archived"], default: "active" },
  },
  opts,
);
const jobSchema = new Schema(
  {
    moderationBlocked: { type: Boolean, default: false },
    moderationReason: String,
    companyId: { type: Schema.Types.ObjectId, required: true },
    projectId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    skills: [String],
    screeningQuestions: [
      {
        _id: false,
        id: String,
        text: String,
        required: { type: Boolean, default: true },
      },
    ],
    budgetMin: { type: Number, required: true },
    budgetMax: { type: Number, required: true },
    currency: {
      type: String,
      enum: ["USD", "PKR", "GBP", "EUR"],
      default: "USD",
    },
    employmentType: {
      type: String,
      enum: ["contract", "full_time", "part_time", "internship"],
      default: "contract",
    },
    status: {
      type: String,
      enum: ["draft", "open", "closed"],
      default: "draft",
    },
  },
  opts,
);
jobSchema.index({title:"text",description:"text",skills:"text"},{name:"job_text_search"});
jobSchema.index({ status: 1, _id: -1 });
jobSchema.index({ companyId: 1, createdAt: -1, _id: -1 });
jobSchema.index({ projectId: 1, status: 1 });
jobSchema.index({ status: 1, createdAt: -1, _id: -1 });
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    refreshHash: { type: String, required: true, unique: true },
    authVersion: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  opts,
);
export const User = mongoose.models.User || mongoose.model("User", userSchema);
export const Company =
  mongoose.models.Company || mongoose.model("Company", companySchema);
export const Member =
  mongoose.models.Member || mongoose.model("Member", memberSchema);
export const Project =
  mongoose.models.Project || mongoose.model("Project", projectSchema);
export const Job = mongoose.models.Job || mongoose.model("Job", jobSchema);
export const Session =
  mongoose.models.Session || mongoose.model("Session", sessionSchema);
export async function connect() {
  await mongoose.connect((await import("./config")).config.MONGODB_URI);
  const { hiringModels } = await import("./hiring-models");
  const { Audit } = await import("./admin");
  const { Invitation } = await import("./team");
  const { day3Models } = await import("./day3-models");
  await Promise.all(
    [
      User,
      Company,
      Member,
      Project,
      Job,
      Session,
      ...hiringModels,
      ...day3Models,
      Invitation,
      Audit,
    ].map((m) => m.init()),
  );
}
