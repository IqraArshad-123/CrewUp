import dotenv from "dotenv";
import { z } from "zod";
dotenv.config({ path: ".env.local", quiet: true });
const env = z
  .object({
    QUEUE_PREFIX: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .default("crewup"),
    REDIS_URL: z.url().optional(),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
    MONGODB_URI: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    API_PORT: z.coerce.number().default(4100),
    API_HOST: z.string().default("127.0.0.1"),
    MAIL_MODE: z.enum(["local", "smtp"]).default("local"),
    MAIL_DIR: z.string().default(".data/mail"),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_SECURE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.email().optional(),
    APP_URL: z.url().default("http://localhost:3000"),
    FILE_STORAGE: z.enum(["local", "s3"]).default("local"),
    PRIVATE_FILES_DIR: z.string().default(".data/private"),
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().default("us-east-1"),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  })
  .parse(process.env);
export const config = { ...env, production: env.NODE_ENV === "production" };
