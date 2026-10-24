import mongoose from "mongoose";
import Redis from "ioredis";
import { Queue, Worker } from "bullmq";
import { connect } from "./models";
import { config } from "./config";
import { processMail, requireEmail } from "./mailer";
import { processResumes, recruiterDigests } from "./background";
import { cleanTemporaryUploads } from "../scripts/maintenance";
import { log, redis } from "./infrastructure";
export async function runTask(name: string) {
  if (name === "mail-outbox") await processMail(50);
  else if (name === "resume-processing") await processResumes();
  else if (name === "cleanup") await cleanTemporaryUploads(undefined, true);
  else if (name === "daily-digest") await recruiterDigests();
  else throw new Error("Unknown background task");
}
async function main() {
  await connect();
  requireEmail();
  if (config.production && !config.REDIS_URL)
    throw new Error("Production worker requires REDIS_URL.");
  let worker: Worker | undefined,
    queue: Queue | undefined,
    connection: Redis | undefined,
    timer: NodeJS.Timeout | undefined;
  let running = false,
    stopping = false;
  let active: Promise<void> = Promise.resolve();
  if (config.REDIS_URL) {
    connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
    connection.on("error", () => log("worker.redis.unavailable"));
    const options = {
      connection: connection as any,
      prefix: config.QUEUE_PREFIX,
    };
    queue = new Queue("background", options);
    worker = new Worker(
      "background",
      async (j) => {
        await runTask(j.name);
        log("worker.completed", { task: j.name });
      },
      { ...options, concurrency: 2 },
    );
    worker.on("failed", (j) => log("worker.failed", { task: j?.name }));
    worker.on("error", () => log("worker.error"));
    for (const [name, every] of [
      ["mail-outbox", 15000],
      ["resume-processing", 30000],
      ["cleanup", 3600000],
      ["daily-digest", 3600000],
    ] as const)
      await queue.upsertJobScheduler(
        name,
        { every },
        {
          name,
          data: {},
          opts: {
            attempts: 5,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: 100,
            removeOnFail: 100,
          },
        },
      );
  } else {
    let lastHousekeeping = 0;
    const tick = () => {
      if (running || stopping) return;
      running = true;
      active = (async () => {
        try {
          await runTask("mail-outbox");
          await runTask("resume-processing");
          if (Date.now() - lastHousekeeping > 3600000) {
            await runTask("cleanup");
            await runTask("daily-digest");
            lastHousekeeping = Date.now();
          }
        } catch {
          log("worker.local.failure");
        } finally {
          running = false;
        }
      })();
    };
    timer = setInterval(tick, 15000);
    tick();
  }
  log("worker.started", {
    mode: config.REDIS_URL ? "bullmq" : "local polling",
  });
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    if (timer) clearInterval(timer);
    const deadline = setTimeout(() => process.exit(1), 30000);
    deadline.unref();
    await active;
    await worker?.close();
    await queue?.close();
    await connection?.quit();
    await redis?.quit();
    await mongoose.disconnect();
    clearTimeout(deadline);
    log("worker.closed");
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}
if (require.main === module)
  main().catch(() => {
    log("worker.start.failed");
    process.exitCode = 1;
    void mongoose.disconnect();
    redis?.disconnect();
  });
