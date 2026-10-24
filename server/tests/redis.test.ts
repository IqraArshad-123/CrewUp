import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
test(
  "Real Redis: separate BullMQ worker delivers the Mongo outbox; shared rate limits and cache visibility",
  { skip: !process.env.REDIS_INTEGRATION_URL },
  async () => {
    const db = `crewup_redis_test_${Date.now()}`;
    Object.assign(process.env, {
      NODE_ENV: "test",
      QUEUE_PREFIX: db,
      REDIS_URL: process.env.REDIS_INTEGRATION_URL,
      JWT_SECRET: randomBytes(48).toString("hex"),
      MONGODB_URI: `mongodb://127.0.0.1:27018/${db}?replicaSet=crewup`,
      MAIL_MODE: "local",
      MAIL_DIR: `.data/${db}-mail`,
      PRIVATE_FILES_DIR: `.data/${db}-files`,
    });
    const mongoose = (await import("mongoose")).default;
    const { connect, Company, Project, Job } = await import("../src/models");
    const { MailJob } = await import("../src/day3-models");
    const { redis, rateStore, invalidateBoard } =
      await import("../src/infrastructure");
    const { Queue } = await import("bullmq");
    const { default: Redis } = await import("ioredis");
    const { default: express } = await import("express");
    const { rateLimit } = await import("express-rate-limit");
    const request = (await import("supertest")).default;
    const connection = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
    });
    const queue = new Queue("background", {
      connection: connection as any,
      prefix: db,
    });
    let child: ReturnType<typeof spawn> | undefined;
    const until = async (check: () => Promise<boolean>) => {
      const end = Date.now() + 30000;
      while (Date.now() < end) {
        if (await check()) return;
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error("Timed out waiting for Redis/worker proof");
    };
    try {
      await connect();
      await until(async () => redis?.status === "ready");
      await queue.waitUntilReady();
      await queue.obliterate({ force: true });
      const mail = await MailJob.create({
        to: "worker-test@crewup.demo",
        subject: "Worker proof",
        text: "Fictional local test",
      });
      child = spawn(
        process.execPath,
        ["../node_modules/tsx/dist/cli.mjs", "src/worker.ts"],
        { env: process.env, stdio: "ignore", windowsHide: true },
      );
      await until(
        async () => (await MailJob.findById(mail._id))?.status === "sent",
      );
      await until(async () =>
        (await queue.getCompleted()).some((j) => j.name === "mail-outbox"),
      );
      const a = express(),
        b = express();
      for (const app of [a, b]) {
        app.use(
          rateLimit({
            windowMs: 60000,
            limit: 2,
            store: rateStore(db),
            validate: false,
          }),
        );
        app.get("/", (_req, res) => res.json({ ok: true }));
      }
      await request(a).get("/").expect(200);
      await request(b).get("/").expect(200);
      await request(a).get("/").expect(429);
      const c = await Company.create({
        name: "Cache test",
        ownerId: new mongoose.Types.ObjectId(),
        status: "verified",
      });
      const p = await Project.create({
        companyId: c._id,
        name: "Cache project",
        description: "Test project",
        startDate: new Date(),
        endDate: new Date(),
      });
      const j = await Job.create({
        companyId: c._id,
        projectId: p._id,
        title: "CacheUniqueRole",
        budgetMin: 1,
        budgetMax: 2,
        status: "open",
      });
      const app = (await import("../src/app")).buildApp();
      assert.equal(
        (await request(app).get("/api/public/jobs?q=CacheUniqueRole")).body.jobs
          .length,
        1,
      );
      await Job.updateOne(
        { _id: j._id },
        { $set: { moderationBlocked: true } },
      );
      assert.equal(
        (await request(app).get("/api/public/jobs?q=CacheUniqueRole")).body.jobs
          .length,
        0,
      );
      await invalidateBoard();
    } finally {
      if (child) {
        const stopped = new Promise<void>((r) =>
          child!.once("exit", () => r()),
        );
        child.kill("SIGTERM");
        await stopped;
      }
      await queue.obliterate({ force: true });
      await queue.close();
      await connection.quit();
      redis?.disconnect();
      if (mongoose.connection.name === db)
        await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      await rm(`.data/${db}-mail`, { recursive: true, force: true });
      await rm(`.data/${db}-files`, { recursive: true, force: true });
    }
  },
);
