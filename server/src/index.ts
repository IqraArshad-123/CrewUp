import { redis, readyRedis } from "./infrastructure";
import mongoose from "mongoose";
import { connect } from "./models";
import { config } from "./config";
import { buildApp } from "./app";
import { requireEmail } from "./mailer";
async function main() {
  if (config.production) {
    if (!config.REDIS_URL) throw new Error("Production requires REDIS_URL.");
    requireEmail();
    if (
      new URL(config.APP_URL).protocol !== "https:" ||
      new URL(config.APP_URL).pathname !== "/"
    )
      throw new Error(
        "Production APP_URL must be an HTTPS origin without a path.",
      );
  }
  await connect();
  await readyRedis();

  const server = buildApp().listen(config.API_PORT, config.API_HOST, () =>
    console.log(`CrewUp API: http://127.0.0.1:${config.API_PORT}`),
  );
  let closing = false;
  const stop = () => {
    if (closing) return;
    closing = true;

    server.close(async () => {
      redis?.disconnect();
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
