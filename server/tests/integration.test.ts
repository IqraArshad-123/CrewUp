import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { readFile, unlink, rm, writeFile, mkdir, utimes } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import mongoose from "mongoose";

Object.assign(process.env, { NODE_ENV: "test" });
process.env.JWT_SECRET = randomBytes(48).toString("hex");
const database = `crewup_test_${Date.now()}`;
process.env.PRIVATE_FILES_DIR = `.data/${database}-files`;
process.env.FILE_STORAGE = "local";
process.env.MAIL_MODE = "local";
process.env.MAIL_DIR = `.data/${database}-mail`;
process.env.MONGODB_URI = `mongodb://127.0.0.1:27018/${database}?replicaSet=crewup`;
let app: any, models: any;
const mailFiles: string[] = [];
const password = "IntegrationTest!2026";
before(async () => {
  models = await import("../src/models");
  await models.connect();
  app = (await import("../src/app")).buildApp();
});
after(async () => {
  if (mongoose.connection.name === database)
    await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await Promise.all(mailFiles.map((f) => unlink(f).catch(() => {})));
  await rm(`.data/${database}-files`, { recursive: true, force: true });
  await rm(`.data/${database}-mail`, { recursive: true, force: true });
});

test("Day 2: private CVs, atomic applications, immutable snapshots, review permissions and stages", async () => {
  const { Profile, Application } = await import("../src/hiring-models");
  const recruiter = await account(),
    outsider = await account(),
    candidate = await account("applicant"),
    other = await account("applicant"),
    unverified = await account("applicant", false);
  const company = (
    await recruiter.agent
      .post("/api/workspace/company")
      .send(companyBody)
      .expect(201)
  ).body.company;
  const foreign = (
    await outsider.agent
      .post("/api/workspace/company")
      .send({ ...companyBody, name: "Other hiring studio" })
      .expect(201)
  ).body.company;
  await models.Company.updateMany(
    { _id: { $in: [company._id, foreign._id] } },
    { $set: { status: "verified" } },
  );
  const project = (
    await recruiter.agent
      .post("/api/workspace/projects")
      .send(projectBody)
      .expect(201)
  ).body.project;
  async function role(title: string) {
    const j = (
      await recruiter.agent
        .post("/api/workspace/jobs")
        .send({
          ...jobBody(project._id),
          title,
          screeningQuestions: [
            {
              text: "Which relevant project have you shipped?",
              required: true,
            },
          ],
        })
        .expect(201)
    ).body.job;
    await recruiter.agent
      .patch(`/api/workspace/jobs/${j._id}/status`)
      .send({ status: "open" })
      .expect(200);
    return (await models.Job.findById(j._id)).toObject();
  }
  const job = await role("Lead frontend developer"),
    job2 = await role("Backend developer");
  const profile = {
    headline: "Full stack developer",
    bio: "I build accessible applications for independent project teams.",
    skills: ["TypeScript", "MongoDB"],
    location: "Lahore",
    portfolioUrl: "",
    availableFrom: "2026-11-01",
    availableUntil: "2026-12-31",
  };
  await unverified.agent
    .put("/api/candidate/profile")
    .send(profile)
    .expect(403);
  await recruiter.agent.put("/api/candidate/profile").send(profile).expect(403);
  await candidate.agent
    .post("/api/candidate/uploads")
    .send({ filename: "resume.pdf", size: 100 })
    .expect(422);
  await candidate.agent
    .put("/api/candidate/profile")
    .send({ ...profile, portfolioUrl: "javascript:alert(1)" })
    .expect(422);
  await candidate.agent.put("/api/candidate/profile").send(profile).expect(200);
  await other.agent.put("/api/candidate/profile").send(profile).expect(200);
  await candidate.agent
    .post("/api/candidate/saved")
    .send({ jobId: String(job._id) })
    .expect(200);
  await candidate.agent
    .post("/api/candidate/saved")
    .send({ jobId: String(job._id) })
    .expect(200);
  assert.equal(
    (await candidate.agent.get("/api/candidate")).body.savedJobs.length,
    1,
  );
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("CrewUp integration test CV");
  const bytes = Buffer.from(await pdf.save());
  async function upload() {
    const t = (
      await candidate.agent
        .post("/api/candidate/uploads")
        .send({ filename: "resume.pdf", size: bytes.length })
        .expect(201)
    ).body;
    await other.agent
      .put(t.url)
      .set("Content-Type", "application/pdf")
      .send(bytes)
      .expect(404);
    await candidate.agent
      .put(t.url)
      .set("Content-Type", "application/pdf")
      .send(Buffer.alloc(bytes.length, 65))
      .expect(422);
    await candidate.agent
      .put(t.url)
      .set("Content-Type", "application/pdf")
      .send(bytes)
      .expect(200);
    const resume = (
      await candidate.agent
        .post(`/api/candidate/uploads/${t.id}/confirm`)
        .expect(201)
    ).body.resume;
    const repeat = (
      await candidate.agent
        .post(`/api/candidate/uploads/${t.id}/confirm`)
        .expect(200)
    ).body.resume;
    assert.equal(resume._id, repeat._id);
    assert.equal(resume.storageKey, undefined);
    return resume;
  }
  await candidate.agent
    .post("/api/candidate/uploads")
    .send({ filename: "../resume.pdf", size: bytes.length })
    .expect(422);
  await candidate.agent
    .post("/api/candidate/uploads")
    .send({ filename: "huge.pdf", size: 6 * 1024 * 1024 })
    .expect(422);
  const resume = await upload();
  const own = await candidate.agent
    .get(`/api/files/resumes/${resume._id}`)
    .expect(200);
  assert.deepEqual(own.body, bytes);
  await other.agent.get(`/api/files/resumes/${resume._id}`).expect(404);
  await recruiter.agent.get(`/api/files/resumes/${resume._id}`).expect(404);
  const entry = (j: any) => ({
    jobId: String(j._id),
    jobUpdatedAt: j.updatedAt.toISOString(),
    coverLetter:
      "I can build the accessible interface and collaborate with your project team.",
    answers: [
      {
        questionId: j.screeningQuestions[0].id,
        answer: "A tested Next.js project with a MongoDB backend.",
      },
    ],
  });
  await candidate.agent
    .post("/api/candidate/applications")
    .send({ resumeId: resume._id, entries: [{ ...entry(job), answers: [] }] })
    .expect(422);
  await candidate.agent
    .post("/api/candidate/applications")
    .send({
      resumeId: resume._id,
      entries: [
        entry(job),
        { ...entry(job2), jobUpdatedAt: "2000-01-01T00:00:00.000Z" },
      ],
    })
    .expect(409);
  assert.equal(
    await Application.countDocuments({ companyId: company._id }),
    0,
    "Batch failure must roll back every application",
  );
  const results = await Promise.all(
    [1, 2].map(() =>
      candidate.agent
        .post("/api/candidate/applications")
        .send({ resumeId: resume._id, entries: [entry(job), entry(job2)] }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
  assert.equal(await Application.countDocuments({ companyId: company._id }), 2);
  let ownData = (await candidate.agent.get("/api/candidate").expect(200)).body;
  assert.equal(ownData.savedJobs.length, 0);
  let application = ownData.applications.find(
    (a: any) => a.jobId === String(job._id),
  );
  const otherApp = ownData.applications.find(
    (a: any) => a.jobId === String(job2._id),
  );
  await candidate.agent
    .put("/api/candidate/profile")
    .send({ ...profile, headline: "Changed after applying" })
    .expect(200);
  await recruiter.agent
    .patch(`/api/workspace/jobs/${job._id}`)
    .send({ ...jobBody(String(project._id)), title: "Changed job title" })
    .expect(200);
  application = (
    await candidate.agent.get("/api/candidate")
  ).body.applications.find((a: any) => a._id === application._id);
  assert.equal(application.snapshot.candidate.headline, profile.headline);
  assert.equal(application.snapshot.job.title, "Lead frontend developer");
  const nextResume = await upload();
  assert.notEqual(nextResume._id, resume._id);
  await recruiter.agent.get(`/api/files/resumes/${resume._id}`).expect(200);
  await recruiter.agent.get(`/api/files/resumes/${nextResume._id}`).expect(404);
  await outsider.agent.get(`/api/files/resumes/${resume._id}`).expect(404);
  assert.equal(
    (await outsider.agent.get("/api/hiring").expect(200)).body.applications
      .length,
    0,
  );
  await outsider.agent
    .patch(`/api/hiring/applications/${application._id}/stage`)
    .send({ stage: "screening", version: 0 })
    .expect(404);
  await candidate.agent
    .patch(`/api/hiring/applications/${application._id}/stage`)
    .send({ stage: "screening", version: 0 })
    .expect(403);
  await recruiter.agent
    .patch(`/api/hiring/applications/${application._id}/notes`)
    .send({ notes: "Private review: strong technical fit", version: 0 })
    .expect(200);
  assert.equal(
    (await candidate.agent.get("/api/candidate")).body.applications.find(
      (a: any) => a._id === application._id,
    ).notes,
    undefined,
  );
  const hiring = (await recruiter.agent.get("/api/hiring")).body;
  assert.equal(
    hiring.applications.find((a: any) => a._id === application._id).notes,
    "Private review: strong technical fit",
  );
  await recruiter.agent
    .patch(`/api/hiring/applications/${application._id}/stage`)
    .send({ stage: "screening", version: 0 })
    .expect(409);
  await recruiter.agent
    .patch(`/api/hiring/applications/${application._id}/stage`)
    .send({ stage: "interview", version: 1 })
    .expect(200);
  await recruiter.agent
    .patch(`/api/hiring/applications/${application._id}/stage`)
    .send({ stage: "screening", version: 2 })
    .expect(422);
  await recruiter.agent
    .patch(`/api/hiring/applications/${application._id}/stage`)
    .send({ stage: "hired", version: 2 })
    .expect(200);
  await recruiter.agent
    .patch(`/api/hiring/applications/${application._id}/stage`)
    .send({ stage: "rejected", version: 3 })
    .expect(422);
  await candidate.agent
    .patch(`/api/candidate/applications/${application._id}/withdraw`)
    .send({ version: 3 })
    .expect(409);
  await other.agent
    .patch(`/api/candidate/applications/${otherApp._id}/withdraw`)
    .send({ version: 0 })
    .expect(409);
  await candidate.agent
    .patch(`/api/candidate/applications/${otherApp._id}/withdraw`)
    .send({ version: 0 })
    .expect(200);
  await recruiter.agent
    .patch(`/api/hiring/applications/${otherApp._id}/stage`)
    .send({ stage: "screening", version: 1 })
    .expect(422);
  const final = (await recruiter.agent.get("/api/hiring")).body;
  assert.equal(final.coverage[0].hires, 1);
  assert.equal(final.stats.withdrawn, 1);
  assert.equal(final.stats.hired, 1);
  const savedUser = await models.User.findOne({ email: candidate.email });
  await Profile.updateOne(
    { userId: savedUser._id },
    {
      $set: {
        savedJobIds: Array.from(
          { length: 100 },
          () => new mongoose.Types.ObjectId(),
        ),
      },
    },
  );
  await candidate.agent
    .post("/api/candidate/saved")
    .send({ jobId: String(job2._id) })
    .expect(422);
  await models.Company.updateOne(
    { _id: company._id },
    { $set: { status: "suspended" } },
  );
  await recruiter.agent.get(`/api/files/resumes/${resume._id}`).expect(404);
  await recruiter.agent.get("/api/hiring").expect(403);
});
async function account(role = "recruiter", verify = true) {
  const agent = request.agent(app);
  const email = `test-${randomBytes(8).toString("hex")}@example.com`;
  const result = await agent
    .post("/api/auth/register")
    .send({ name: "Test Person", email, password, role });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  mailFiles.push(`${process.env.MAIL_DIR}/${email}.json`);
  if (verify)
    await models.User.updateOne({ email }, { $set: { verified: true } });
  return { agent, email };
}
const companyBody = {
  name: "Test Studio",
  description: "A company building useful software for people.",
  industry: "Technology",
  website: "",
};
const projectBody = {
  name: "Build a helpful platform",
  description: "Create an accessible workspace for independent teams.",
  category: "Software & technology",
  startDate: "2026-11-01",
  endDate: "2026-12-01",
  workMode: "remote",
  location: "",
};
const jobBody = (projectId: string) => ({
  projectId,
  title: "Frontend developer",
  description: "Build accessible components and deliver the project interface.",
  skills: ["TypeScript", "React"],
  budgetMin: 1000,
  budgetMax: 2000,
  currency: "USD",
  employmentType: "contract",
});

test("public signup cannot create an admin; protected routes require authentication", async () => {
  await request(app)
    .post("/api/auth/register")
    .send({
      name: "Bad Actor",
      email: "admin-test@example.com",
      password,
      role: "admin",
    })
    .expect(422);
  await request(app).get("/api/workspace").expect(401);
  const { agent } = await account("applicant");
  await agent.get("/api/admin").expect(403);
  await agent.get("/api/workspace").expect(403);
});
test("email verification is required and tokens are single use; credentials remain private", async () => {
  const { agent, email } = await account("recruiter", false);
  await agent.post("/api/workspace/company").send(companyBody).expect(403);
  const mail = JSON.parse(
    await readFile(`${process.env.MAIL_DIR}/${email}.json`, "utf8"),
  );
  await request(app).get("/api/auth/development-mail").expect(401);
  const inbox = await agent.get("/api/auth/development-mail").expect(200);
  assert.equal(inbox.body.url, mail.url);
  const token = new URL(mail.url).searchParams.get("token");
  await agent.post("/api/auth/verify").send({ token }).expect(200);
  await agent.post("/api/auth/verify").send({ token }).expect(400);
  const me = await agent.get("/api/auth/me").expect(200);
  assert.equal(me.body.user.verified, true);
  assert.equal(me.body.user.passwordHash, undefined);
  await request(app)
    .post("/api/auth/login")
    .send({ email, password: "wrong password" })
    .expect(401);
  await request(app)
    .post("/api/auth/register")
    .send({ name: "Duplicate", email, password, role: "recruiter" })
    .expect(409);
});
test("tenant isolation, company approval, publishing and suspension are enforced", async () => {
  const a = await account(),
    b = await account(),
    admin = await account();
  await models.User.updateOne(
    { email: admin.email },
    { $set: { role: "admin" } },
  );
  const company = (
    await a.agent.post("/api/workspace/company").send(companyBody).expect(201)
  ).body.company;
  await b.agent
    .post("/api/workspace/company")
    .send({ ...companyBody, name: "Other Studio" })
    .expect(201);
  await a.agent.post("/api/workspace/company").send(companyBody).expect(409);
  const project = (
    await a.agent.post("/api/workspace/projects").send(projectBody).expect(201)
  ).body.project;
  await b.agent
    .patch(`/api/workspace/projects/${project._id}`)
    .send(projectBody)
    .expect(404);
  await b.agent
    .post("/api/workspace/jobs")
    .send(jobBody(project._id))
    .expect(404);
  const job = (
    await a.agent
      .post("/api/workspace/jobs")
      .send(jobBody(project._id))
      .expect(201)
  ).body.job;
  await a.agent
    .patch(`/api/workspace/jobs/${job._id}/status`)
    .send({ status: "open" })
    .expect(403);
  await admin.agent
    .patch(`/api/admin/companies/${company._id}/status`)
    .send({ status: "verified" })
    .expect(200);
  await b.agent
    .patch(`/api/workspace/jobs/${job._id}`)
    .send(jobBody(project._id))
    .expect(404);
  await a.agent
    .patch(`/api/workspace/jobs/${job._id}/status`)
    .send({ status: "open" })
    .expect(200);
  let board = await request(app).get("/api/public/jobs").expect(200);
  assert.ok(board.body.jobs.some((j: any) => j._id === job._id));
  await admin.agent
    .patch(`/api/admin/companies/${company._id}/status`)
    .send({ status: "suspended" })
    .expect(200);
  board = await request(app).get("/api/public/jobs").expect(200);
  assert.ok(!board.body.jobs.some((j: any) => j._id === job._id));
  assert.equal((await models.Job.findById(job._id)).status, "closed");
  await a.agent
    .patch(`/api/workspace/projects/${project._id}`)
    .send(projectBody)
    .expect(403);
  await a.agent
    .patch(`/api/workspace/jobs/${job._id}/status`)
    .send({ status: "open" })
    .expect(403);
});
test("validation rejects invalid dates, budgets, website schemes and hostile origins", async () => {
  const { agent } = await account();
  await agent
    .post("/api/workspace/company")
    .send({ ...companyBody, website: "javascript:alert(1)" })
    .expect(422);
  await agent.post("/api/workspace/company").send(companyBody).expect(201);
  await agent
    .post("/api/workspace/projects")
    .send({ ...projectBody, endDate: "2020-01-01" })
    .expect(422);
  const project = (
    await agent.post("/api/workspace/projects").send(projectBody).expect(201)
  ).body.project;
  await agent
    .post("/api/workspace/jobs")
    .send({ ...jobBody(project._id), budgetMax: 1 })
    .expect(422);
  await agent
    .post("/api/workspace/projects")
    .set("Origin", "https://attacker.example")
    .send(projectBody)
    .expect(403);
});
test("refresh token rotation rejects replay; logout revokes access immediately", async () => {
  const { agent, email } = await account();
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email, password })
    .expect(200);
  const oldCookies = login.headers["set-cookie"] as unknown as string[];
  const oldRefresh = oldCookies
    .find((c) => c.startsWith("crewup_refresh="))!
    .split(";")[0];
  await request(app)
    .post("/api/auth/refresh")
    .set("Cookie", oldRefresh)
    .expect(200);
  await request(app)
    .post("/api/auth/refresh")
    .set("Cookie", oldRefresh)
    .expect(401);
  const ownLogin = await agent
    .post("/api/auth/login")
    .send({ email, password })
    .expect(200);
  const access = (ownLogin.headers["set-cookie"] as unknown as string[])
    .find((c) => c.startsWith("crewup_access="))!
    .split(";")[0];
  await agent.post("/api/auth/logout").expect(200);
  await request(app).get("/api/auth/me").set("Cookie", access).expect(401);
});

test("Day 3: interview transactions, conflicts, permissions, calendar, feedback and withdrawal", async () => {
  const { Interview, Notification, MailJob } =
    await import("../src/day3-models");
  const { Application } = await import("../src/hiring-models");
  const a = await account(),
    b = await account(),
    candidate = await account("applicant"),
    other = await account("applicant"),
    viewer = await account();
  const ca = (
    await a.agent.post("/api/workspace/company").send(companyBody).expect(201)
  ).body.company;
  const cb = (
    await b.agent
      .post("/api/workspace/company")
      .send({ ...companyBody, name: "Second interview team" })
      .expect(201)
  ).body.company;
  await models.Company.updateMany(
    { _id: { $in: [ca._id, cb._id] } },
    { $set: { status: "verified" } },
  );
  const ua = await models.User.findOne({ email: a.email }),
    uc = await models.User.findOne({ email: candidate.email }),
    uo = await models.User.findOne({ email: other.email }),
    uv = await models.User.findOne({ email: viewer.email });
  await models.Member.create({
    userId: uv._id,
    companyId: ca._id,
    role: "hiring_manager",
  });
  async function application(companyId: any, user: any) {
    return Application.create({
      companyId,
      userId: user._id,
      projectId: new mongoose.Types.ObjectId(),
      jobId: new mongoose.Types.ObjectId(),
      resumeId: new mongoose.Types.ObjectId(),
      snapshot: {
        candidate: { name: user.name, email: user.email },
        job: { title: "Software engineer" },
        project: { name: "Interview test project" },
        company: { name: "Test Studio" },
      },
      stage: "screening",
      history: [
        { stage: "applied", at: new Date() },
        { stage: "screening", at: new Date() },
      ],
    });
  }
  const first = await application(ca._id, uc),
    foreign = await application(cb._id, uc),
    sameOrganizer = await application(ca._id, uo);
  const future = new Date(Date.now() + 86400000);
  future.setUTCSeconds(0, 0);
  const detail = {
    title: "Technical conversation",
    startsAt: future.toISOString(),
    durationMinutes: 30,
    timeZone: "Asia/Karachi",
    meetingUrl: "https://meet.example.com/demo",
    location: "",
    instructions: "Discuss your approach to testing.",
  };
  const body = {
    applicationId: String(first._id),
    version: 0,
    stage: "interview",
    details: detail,
  };
  await candidate.agent.post("/api/interviews").send(body).expect(403);
  await viewer.agent.post("/api/interviews").send(body).expect(403);
  await b.agent.post("/api/interviews").send(body).expect(404);
  await a.agent
    .post("/api/interviews")
    .send({
      ...body,
      details: { ...detail, startsAt: "2000-01-01T00:00:00.000Z" },
    })
    .expect(422);
  await a.agent
    .post("/api/interviews")
    .send({
      ...body,
      details: { ...detail, meetingUrl: "javascript:alert(1)" },
    })
    .expect(422);
  await a.agent
    .post("/api/interviews")
    .send({ ...body, details: { ...detail, timeZone: "Not/AZone" } })
    .expect(422);
  const race = await Promise.all(
    [1, 2].map(() => a.agent.post("/api/interviews").send(body)),
  );
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
  const interview = race.find((r) => r.status === 201)!.body.interview;
  assert.equal(await Interview.countDocuments({ applicationId: first._id }), 1);
  assert.equal((await Application.findById(first._id)).stage, "interview");
  assert.equal(
    (await Application.findById(first._id)).history.filter(
      (h: any) => h.stage === "interview",
    ).length,
    1,
  );
  await b.agent
    .post("/api/interviews")
    .send({ ...body, applicationId: String(foreign._id) })
    .expect(409);
  await a.agent
    .post("/api/interviews")
    .send({ ...body, applicationId: String(sameOrganizer._id) })
    .expect(409);
  assert.equal((await Application.findById(foreign._id)).stage, "screening");
  assert.equal(await Interview.countDocuments({ companyId: cb._id }), 0);
  assert.equal(
    (await candidate.agent.get("/api/interviews")).body.interviews.length,
    1,
  );
  assert.equal(
    (await other.agent.get("/api/interviews")).body.interviews.length,
    0,
  );
  assert.equal(
    (await viewer.agent.get("/api/interviews")).body.canManage,
    false,
  );
  await other.agent
    .get(`/api/interviews/${interview._id}/calendar`)
    .expect(404);
  await b.agent.get(`/api/interviews/${interview._id}/calendar`).expect(404);
  const calendar = await candidate.agent
    .get(`/api/interviews/${interview._id}/calendar`)
    .expect(200);
  assert.match(calendar.text, /BEGIN:VCALENDAR/);
  assert.match(calendar.text, /DTSTART:\d{8}T\d{6}Z/);
  assert.match(calendar.headers["content-disposition"], /attachment/);
  await a.agent
    .patch(`/api/interviews/${interview._id}/feedback`)
    .send({
      version: 0,
      outcome: "moved_forward",
      feedback: "Clear understanding of the problem.",
    })
    .expect(422);
  const newDetail = {
    ...detail,
    startsAt: new Date(future.getTime() + 7200000).toISOString(),
  };
  await b.agent
    .patch(`/api/interviews/${interview._id}`)
    .send({ version: 0, details: newDetail })
    .expect(404);
  await a.agent
    .patch(`/api/interviews/${interview._id}`)
    .send({ version: 0, details: newDetail })
    .expect(200);
  await a.agent
    .patch(`/api/interviews/${interview._id}`)
    .send({ version: 0, details: newDetail })
    .expect(409);
  await Interview.updateOne(
    { _id: interview._id },
    {
      $set: {
        startsAt: new Date(Date.now() - 7200000),
        endsAt: new Date(Date.now() - 3600000),
      },
    },
  );
  await a.agent
    .patch(`/api/interviews/${interview._id}/feedback`)
    .send({
      version: 1,
      outcome: "moved_forward",
      feedback: "Private evaluation: explained tradeoffs clearly.",
    })
    .expect(200);
  await a.agent
    .patch(`/api/interviews/${interview._id}/feedback`)
    .send({
      version: 1,
      outcome: "rejected",
      feedback: "A conflicting second decision must fail.",
    })
    .expect(409);
  assert.equal(
    (await Application.findById(first._id)).stage,
    "final_interview",
  );
  assert.equal(
    (await candidate.agent.get("/api/interviews")).body.interviews[0].feedback,
    undefined,
  );
  assert.equal(
    (await a.agent.get("/api/interviews")).body.interviews[0].feedback,
    "Private evaluation: explained tradeoffs clearly.",
  );
  const nowApp = await Application.findById(first._id);
  const finalInterview = (
    await a.agent
      .post("/api/interviews")
      .send({
        ...body,
        version: nowApp.version,
        stage: "final_interview",
        details: newDetail,
      })
      .expect(201)
  ).body.interview;
  const version = (await Application.findById(first._id)).version;
  await candidate.agent
    .patch(`/api/candidate/applications/${first._id}/withdraw`)
    .send({ version })
    .expect(200);
  assert.equal(
    (await Interview.findById(finalInterview._id)).status,
    "cancelled",
  );
  const notices = (await candidate.agent.get("/api/notifications").expect(200))
    .body;
  assert.ok(notices.unread >= 4);
  assert.ok(
    notices.notifications.some((n: any) => n.title === "Interview cancelled"),
  );
  const note = notices.notifications[0];
  await other.agent.patch(`/api/notifications/${note._id}/read`).expect(404);
  await candidate.agent
    .patch(`/api/notifications/${note._id}/read`)
    .expect(200);
  await candidate.agent.patch("/api/notifications/read-all").expect(200);
  assert.equal(
    (await candidate.agent.get("/api/notifications")).body.unread,
    0,
  );
  assert.ok(await MailJob.countDocuments({ status: "pending" }));
  assert.ok(
    await Notification.exists({ userId: ua._id, title: "Interview scheduled" }),
  );
  const c = (
    await a.agent
      .post("/api/interviews")
      .send({ ...body, applicationId: String(sameOrganizer._id) })
      .expect(201)
  ).body.interview;
  await a.agent
    .patch(`/api/interviews/${c._id}/cancel`)
    .send({ version: 0, reason: "The project team needs a different time." })
    .expect(200);
  await a.agent
    .patch(`/api/interviews/${c._id}/cancel`)
    .send({ version: 0, reason: "Second cancellation should fail." })
    .expect(409);
});

test("Day 3: password reset is private, expiring, single use and revokes every session", async () => {
  const u = await account("applicant");
  const known = await u.agent
    .post("/api/auth/forgot-password")
    .send({ email: u.email })
    .expect(200);
  const unknown = await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: "missing@example.com" })
    .expect(200);
  assert.deepEqual(known.body, unknown.body);
  assert.equal(known.body.token, undefined);
  const file = `${process.env.MAIL_DIR}/${u.email}.reset.json`;
  let mail = JSON.parse(await readFile(file, "utf8"));
  let token = new URL(mail.url).searchParams.get("token");
  await models.User.updateOne(
    { email: u.email },
    { $set: { resetExpires: new Date(Date.now() - 1000) } },
  );
  await request(app)
    .post("/api/auth/reset-password")
    .send({ token, password: "NewSecurePassword!2026" })
    .expect(400);
  await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: u.email })
    .expect(200);
  mail = JSON.parse(await readFile(file, "utf8"));
  token = new URL(mail.url).searchParams.get("token");
  await request(app)
    .post("/api/auth/reset-password")
    .send({ token, password: "short" })
    .expect(422);
  await request(app)
    .post("/api/auth/reset-password")
    .send({ token, password: "NewSecurePassword!2026" })
    .expect(200);
  await request(app)
    .post("/api/auth/reset-password")
    .send({ token, password: "DifferentPassword!2026" })
    .expect(400);
  await u.agent.get("/api/auth/me").expect(401);
  await u.agent.post("/api/auth/refresh").expect(401);
  await request(app)
    .post("/api/auth/login")
    .send({ email: u.email, password })
    .expect(401);
  const fresh = request.agent(app);
  await fresh
    .post("/api/auth/login")
    .send({ email: u.email, password: "NewSecurePassword!2026" })
    .expect(200);
  await fresh.get("/api/auth/me").expect(200);
});

test("Day 3: durable email retries do not repeat business operations; sent payloads are removed", async () => {
  const { processMail, queueMail } = await import("../src/mailer");
  const { MailJob } = await import("../src/day3-models");
  const { config } = await import("../src/config");
  await processMail(1000);
  const original = config.MAIL_DIR;
  const marker = `${original}/blocked-path`;
  await writeFile(marker, "test");
  const job = await queueMail({
    to: "queue-test@example.com",
    subject: "Retry test",
    text: "A test notification.",
  });
  config.MAIL_DIR = marker;
  try {
    await processMail(1);
  } finally {
    config.MAIL_DIR = original;
  }
  let state = await MailJob.findById(job._id);
  assert.equal(state.status, "pending");
  assert.equal(state.attempts, 1);
  await MailJob.updateOne(
    { _id: job._id },
    { $set: { nextAttempt: new Date(0) } },
  );
  await processMail(1);
  state = await MailJob.findById(job._id).select("+text +to");
  assert.equal(state.status, "sent");
  assert.equal(state.attempts, 2);
  assert.equal(state.text, undefined);
  assert.equal(state.to, undefined);
  await processMail(1);
  assert.equal((await MailJob.findById(job._id)).attempts, 2);
});

test("Day 3: timezone conversion preserves instants and rejects daylight-saving ambiguities", async () => {
  const { zonedToISO, localInput } = await import("@crewup/shared/interview-time");
  assert.equal(
    zonedToISO("2026-11-01T10:00", "Asia/Karachi"),
    "2026-11-01T05:00:00.000Z",
  );
  assert.equal(
    localInput("2026-11-01T05:00:00.000Z", "Asia/Karachi"),
    "2026-11-01T10:00",
  );
  assert.throws(() => zonedToISO("2026-03-08T02:30", "America/New_York"));
  assert.throws(() => zonedToISO("2026-11-01T01:30", "America/New_York"));
});


test('Team invitations: expiry, email binding, single-use, owner protection and immediate role access',async()=>{
 const {Invitation}=await import('../src/team');const {MailJob}=await import('../src/day3-models');
 const owner=await account(),invitee=await account(),other=await account();
 const company=(await owner.agent.post('/api/workspace/company').send(companyBody).expect(201)).body.company;
 await owner.agent.post('/api/team/invitations').send({email:invitee.email,role:'hr_manager'}).expect(201);
 const mail=await MailJob.findOne().where('to').equals(invitee.email).sort({_id:-1}).select('+url');const token=new URL(mail.url).searchParams.get('token');
 await other.agent.post('/api/team/accept').send({token}).expect(400);
 const outcomes=await Promise.all([invitee.agent.post('/api/team/accept').send({token}),invitee.agent.post('/api/team/accept').send({token})]);assert.equal(outcomes.filter(r=>r.status===200).length,1);
 const team=(await owner.agent.get('/api/team').expect(200)).body;const member=team.members.find((m:any)=>m.role==='hr_manager'),boss=team.members.find((m:any)=>m.role==='owner');
 await invitee.agent.get('/api/team').expect(200);await invitee.agent.patch(`/api/team/members/${member._id}`).send({role:'recruiter',version:0}).expect(403);
 await owner.agent.patch(`/api/team/members/${boss._id}`).send({role:'recruiter',version:0}).expect(403);await owner.agent.delete(`/api/team/members/${boss._id}`).expect(403);
 await owner.agent.patch(`/api/team/members/${member._id}`).send({role:'recruiter',version:0}).expect(200);await invitee.agent.get('/api/team').expect(403);
 await owner.agent.patch(`/api/team/members/${member._id}`).send({role:'hiring_manager',version:0}).expect(409);
 await owner.agent.delete(`/api/team/members/${member._id}`).expect(200);assert.equal((await invitee.agent.get('/api/workspace')).body.company,null);
 await owner.agent.post('/api/team/invitations').send({email:other.email,role:'recruiter'}).expect(201);const last=await MailJob.findOne().where('to').equals(other.email).sort({_id:-1}).select('+url');await Invitation.updateMany({companyId:company._id},{$set:{expiresAt:new Date(0)}});await other.agent.post('/api/team/accept').send({token:new URL(last.url).searchParams.get('token')}).expect(400);
});

test('Administration: protected administrators, revocation, job holds and audit history',async()=>{
 const owner=await account(),admin=await account();await models.User.updateOne({email:admin.email},{$set:{role:'admin'}});
 const c=(await owner.agent.post('/api/workspace/company').send(companyBody)).body.company;await models.Company.updateOne({_id:c._id},{$set:{status:'verified'}});const p=(await owner.agent.post('/api/workspace/projects').send(projectBody)).body.project;const j=(await owner.agent.post('/api/workspace/jobs').send(jobBody(p._id))).body.job;
 await owner.agent.get('/api/admin/records/users').expect(403);await admin.agent.patch(`/api/admin/jobs/${j._id}/moderation`).send({blocked:true,reason:'Test moderation policy'}).expect(200);await owner.agent.patch(`/api/workspace/jobs/${j._id}/status`).send({status:'open'}).expect(403);
 await admin.agent.patch(`/api/admin/jobs/${j._id}/moderation`).send({blocked:false,reason:'Test review passed'}).expect(200);assert.equal((await models.Job.findById(j._id)).status,'closed');await owner.agent.patch(`/api/workspace/jobs/${j._id}/status`).send({status:'open'}).expect(200);
 const u=await models.User.findOne({email:owner.email});await admin.agent.patch(`/api/admin/users/${u.id}/status`).send({status:'suspended',reason:'Test account review'}).expect(200);await owner.agent.get('/api/auth/me').expect(401);await admin.agent.patch(`/api/admin/users/${u.id}/status`).send({status:'active',reason:'Test review completed'}).expect(200);await owner.agent.get('/api/auth/me').expect(401);
 const a=await models.User.findOne({email:admin.email});await admin.agent.patch(`/api/admin/users/${a.id}/status`).send({status:'suspended',reason:'Cannot suspend self'}).expect(403);
 const audit=(await admin.agent.get('/api/admin/records/audit').expect(200)).body.items;assert.ok(audit.some((r:any)=>r.action==='job.blocked'));const users=(await admin.agent.get('/api/admin/records/users')).body.items;assert.ok(users.every((r:any)=>!r.passwordHash&&!r.resetHash));await admin.agent.get('/api/admin/metrics').expect(200);
});

test('Public board: all pages, literal search, filters and moderation visibility',async()=>{
 const owner=await account();const c=(await owner.agent.post('/api/workspace/company').send({...companyBody,name:'Pagination studio'})).body.company;await models.Company.updateOne({_id:c._id},{$set:{status:'verified'}});const p=(await owner.agent.post('/api/workspace/projects').send(projectBody)).body.project;
 await models.Job.insertMany(Array.from({length:65},(_,i)=>({...jobBody(p._id),companyId:c._id,title:`PaginationUnique ${i}`,status:'open'})));
 let cursor='',ids:string[]=[];do{const r=await request(app).get('/api/public/jobs').query({q:'PaginationUnique',limit:20,...(cursor?{cursor}:{})}).expect(200);ids.push(...r.body.jobs.map((j:any)=>j._id));cursor=r.body.nextCursor;}while(cursor);assert.equal(ids.length,65);assert.equal(new Set(ids).size,65);
 assert.ok((await request(app).get('/api/public/jobs').query({q:'PaginationUnique',searchMode:'keywords'})).body.jobs.length>0);
 assert.equal((await request(app).get('/api/public/jobs').query({q:'PaginationUnique',location:'NowhereUnique'})).body.jobs.length,0);
 assert.equal((await request(app).get('/api/public/jobs').query({q:'PaginationUnique',workMode:'onsite'})).body.jobs.length,0);assert.equal((await request(app).get('/api/public/jobs').query({q:'.*'})).body.jobs.length,0);
 await models.Job.updateOne({_id:ids[0]},{$set:{moderationBlocked:true}});assert.ok(!(await request(app).get('/api/public/jobs').query({q:'PaginationUnique'})).body.jobs.some((j:any)=>j._id===ids[0]));await request(app).get('/api/public/jobs?cursor=bad').expect(422);
});


test('Background processing: private PDF summaries, digest deduplication and safe temporary cleanup',async()=>{
 const {processResumes,recruiterDigests}=await import('../src/background');const {Resume,Application}=await import('../src/hiring-models');const {MailJob}=await import('../src/day3-models');const {putPrivate}=await import('../src/storage');const {cleanTemporaryUploads}=await import('../scripts/maintenance');
 const candidate=await account('applicant');const u=await models.User.findOne({email:candidate.email});const pdf=await PDFDocument.create();pdf.addPage().drawText('CrewUp developer sample CV');const bytes=Buffer.from(await pdf.save());const key=`resumes/${u.id}/worker-test.pdf`;await putPrivate('local',key,bytes);const r=await Resume.create({userId:u.id,filename:'worker.pdf',storageKey:key,storage:'local',size:bytes.length});
 await processResumes(100);const ready=await Resume.findById(r._id);assert.equal(ready.processingStatus,'ready');assert.equal(ready.pageCount,1);assert.equal(ready.wordCount,4);const attempts=ready.processingAttempts;await processResumes(100);assert.equal((await Resume.findById(r._id)).processingAttempts,attempts);
 const owner=await account();const c=(await owner.agent.post('/api/workspace/company').send(companyBody)).body.company;await models.Company.updateOne({_id:c._id},{$set:{status:'verified'}});
 const date=new Date();date.setUTCHours(0,0,0,0);const yesterday=new Date(date.getTime()-3600000);await Application.collection.insertOne({companyId:new mongoose.Types.ObjectId(c._id),userId:u._id,jobId:new mongoose.Types.ObjectId(),createdAt:yesterday});
 await recruiterDigests(date);await recruiterDigests(date);const digest=await MailJob.find({dedupeKey:{$regex:`-${c._id}-`}});assert.equal(digest.length,1);
 const root=`${process.env.PRIVATE_FILES_DIR}/cleanup-test`;await mkdir(root,{recursive:true});await writeFile(`${root}/old.pdf`,'temporary');await writeFile(`${root}/new.pdf`,'temporary');await writeFile(`${root}/keep.txt`,'keep');await utimes(`${root}/old.pdf`,new Date(0),new Date(0));assert.equal((await cleanTemporaryUploads(root)).length,1);assert.equal(await readFile(`${root}/old.pdf`,'utf8'),'temporary');await cleanTemporaryUploads(root,true);await assert.rejects(readFile(`${root}/old.pdf`));assert.equal(await readFile(`${root}/new.pdf`,'utf8'),'temporary');assert.equal(await readFile(`${root}/keep.txt`,'utf8'),'keep');
});


test('Cloud CV downloads: authorize first, issue short-lived signed links without proxying the PDF',async()=>{
 const {config}=await import('../src/config');const {Resume}=await import('../src/hiring-models');const owner=await account('applicant'),other=await account('applicant');const u=await models.User.findOne({email:owner.email});
 const prior={S3_BUCKET:config.S3_BUCKET,S3_REGION:config.S3_REGION,S3_ENDPOINT:config.S3_ENDPOINT,S3_ACCESS_KEY_ID:config.S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY:config.S3_SECRET_ACCESS_KEY};Object.assign(config,{S3_BUCKET:'test-private',S3_REGION:'us-east-1',S3_ENDPOINT:'https://storage.example.test',S3_ACCESS_KEY_ID:'TESTACCESSKEY',S3_SECRET_ACCESS_KEY:'fictional-test-signing-secret'});
 try{const r=await Resume.create({userId:u._id,filename:'Sample CV.pdf',storage:'s3',storageKey:`resumes/${u.id}/sample.pdf`,size:500});await other.agent.get(`/api/files/resumes/${r.id}`).expect(404);const response=await owner.agent.get(`/api/files/resumes/${r.id}`).expect(302);const link=new URL(response.headers.location);assert.equal(link.hostname,'storage.example.test');assert.equal(link.searchParams.get('X-Amz-Expires'),'60');assert.ok(link.searchParams.get('X-Amz-Signature'));assert.match(response.headers['cache-control'],/no-store/);}finally{Object.assign(config,prior);}
});

test('Request-driven Express adapter serves the same API without starting a listener',async()=>{const adapter=(await import('../src/vercel')).default;await request(adapter).get('/health').expect(200);await request(adapter).get('/api/team').expect(401);});
