import { redis, rateStore, invalidateBoard, log } from "./infrastructure";
import { publicRouter } from "./public-board";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { z, ZodError } from "zod";
import { config } from "./config";
import { Application } from "./hiring-models";
import { cancelInterviews } from "./interviews";
import { Audit } from "./admin";
import { adminRouter } from "./admin";
import { teamRouter } from "./team";
import { authRouter } from "./auth";
import { workspaceRouter } from "./workspace";
import { candidateRouter } from "./candidate";
import { hiringRouter, filesRouter } from "./hiring";
import { interviewRouter } from "./interviews";
import { notificationRouter } from "./notifications";
import { auth, role, HttpError, type AuthRequest } from "./shared";
import { Company, Project, Job, User } from "./models";
export function buildApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY_HOPS);
  app.use((req, res, next) => {
    const started = Date.now(),
      requestPath = req.path;
    res.on("finish", () =>
      log("http.request", {
        method: req.method,
        path: requestPath,
        status: res.statusCode,
        durationMs: Date.now() - started,
        requestId: res.getHeader("X-Request-ID"),
      }),
    );
    next();
  });
  app.use((req, res, next) => {
    if (
      ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) &&
      /^\/api\/(workspace|admin)/.test(req.path)
    ) {
      const send = res.json.bind(res);
      res.json = ((body: any) => {
        if (res.statusCode < 400) {
          void invalidateBoard().finally(() => send(body));
          return res;
        }
        return send(body);
      }) as typeof res.json;
    }
    next();
  });
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use((_req, res, next) => {
    res.setHeader("X-Request-ID", randomUUID());
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/ready", async (_req, res) => {
    const db = mongoose.connection.readyState === 1;
    let queue = !config.REDIS_URL;
    try {
      if (redis) queue = (await redis.ping()) === "PONG";
    } catch {}
    res
      .status(db && queue ? 200 : 503)
      .json({
        database: db ? "ready" : "unavailable",
        redis: config.REDIS_URL
          ? queue
            ? "ready"
            : "unavailable"
          : "local mode",
      });
  });
  app.use((req, _res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("origin");
      const allowed = new Set([
        config.APP_URL,
        ...(!config.production
          ? ["http://localhost:3000", "http://127.0.0.1:3000"]
          : []),
      ]);
      if (origin && !allowed.has(origin))
        return next(new HttpError(403, "Request origin is not allowed."));
    }
    next();
  });
  app.use(
    rateLimit({
      store: rateStore("global"),
      windowMs: 60000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      skip: () => config.NODE_ENV === "test",
      message: {
        error: { message: "Too many requests. Please try again shortly." },
      },
    }),
  );
  app.use(
    "/api/auth",
    rateLimit({
      store: rateStore("auth"),
      windowMs: 900000,
      limit: 40,
      skip: (req) =>
        config.NODE_ENV === "test" ||
        ["/me", "/refresh", "/logout"].includes(req.path),
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: {
          message: "Too many attempts. Please try again in 15 minutes.",
        },
      },
    }),
    authRouter,
  );
  app.use("/api/admin", adminRouter);
  app.use("/api/team", teamRouter);
  app.use("/api/workspace", workspaceRouter);
  app.use("/api/candidate", candidateRouter);
  app.use("/api/hiring", hiringRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/interviews", interviewRouter);
  app.use("/api/notifications", notificationRouter);
  app.use("/api/public", publicRouter);
  app.get("/api/admin", auth, role("admin"), async (_req, res) => {
    const [companies, projects, jobs, users] = await Promise.all([
      Company.find().sort({ createdAt: -1 }).lean(),
      Project.countDocuments(),
      Job.countDocuments(),
      User.countDocuments(),
    ]);
    res.json({
      companies,
      stats: { companies: companies.length, projects, jobs, users },
    });
  });
  app.patch(
    "/api/admin/companies/:id/status",
    auth,
    role("admin"),
    async (req: AuthRequest, res) => {
      const companyId = z
        .string()
        .regex(/^[a-f0-9]{24}$/i)
        .parse(req.params.id);
      const { status } = z
        .object({ status: z.enum(["verified", "suspended"]) })
        .strict()
        .parse(req.body);
      let company;
      await mongoose.connection.transaction(async (session) => {
        company = await Company.findByIdAndUpdate(
          companyId,
          { $set: { status } },
          { new: true, session },
        );
        if (!company) throw new HttpError(404, "Company not found.");
        if (status === "suspended") {
          const applications = await Application.find({
            companyId,
            status: "active",
          }).session(session);
          for (const a of applications)
            await cancelInterviews(
              a,
              "Company workspace suspended by the administrator.",
              session,
            );
          await Job.updateMany(
            { companyId, status: "open" },
            { $set: { status: "closed" } },
            { session },
          );
        }
        await Audit.create(
          [
            {
              actorId: req.actor!.id,
              action: `company.${status}`,
              targetId: companyId,
              reason: "Company status review",
            },
          ],
          { session },
        );
      });
      res.json({ company });
    },
  );
  app.use((_req, _res, next) =>
    next(new HttpError(404, "Endpoint not found.")),
  );
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof ZodError)
        return res.status(422).json({
          error: {
            message: err.issues.map((i) => i.message).join(" "),
            fields: err.flatten(),
          },
        });
      if (err instanceof HttpError)
        return res.status(err.status).json({ error: { message: err.message } });
      if (
        typeof err === "object" &&
        err &&
        "type" in err &&
        err.type === "entity.too.large"
      )
        return res.status(413).json({
          error: { message: "File is too large. Maximum CV size is 5 MB." },
        });
      if (typeof err === "object" && err && "code" in err && err.code === 11000)
        return res.status(409).json({
          error: { message: "This account or workspace already exists." },
        });
      console.error(
        JSON.stringify({
          level: "error",
          requestId: res.getHeader("X-Request-ID"),
          message: "Unexpected server failure",
        }),
      );
      res.status(500).json({
        error: { message: "Something went wrong. Please try again." },
      });
    },
  );
  return app;
}
