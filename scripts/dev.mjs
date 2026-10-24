import { spawn } from "node:child_process";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
const settings = dotenv.config({ path: "server/.env.local", quiet: true, processEnv: {} }).parsed || {};
const databaseUri = process.env.MONGODB_URI || settings.MONGODB_URI;
if (!databaseUri?.startsWith('mongodb+srv://')) {
  throw new Error('Configure the Atlas MONGODB_URI in server/.env.local. Local database startup is disabled.');
}
const children = [];
const run = (file, args, cwd) => {
  const p = spawn(process.execPath, [fileURLToPath(new URL("../" + file, import.meta.url)), ...args], {
    stdio: "inherit",
    cwd,
    windowsHide: true,
  });
  children.push(p);
  return p;
};
const deadline = Date.now() + 30000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const { MongoClient } = await import("mongodb");
    const client = new MongoClient(
      databaseUri,
      { serverSelectionTimeoutMS: 5000 },
    );
    try {
      await client.connect();
      await client.db().command({ ping: 1 });
      ready = true;
      break;
    } finally {
      await client.close();
    }
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
  }
}
if (!ready) {
  for (const p of children) p.kill();
  throw new Error("Atlas connection failed. Check credentials and network access; local fallback is disabled.");
}
run("node_modules/tsx/dist/cli.mjs", ["watch", "src/index.ts"], "server");
run("node_modules/tsx/dist/cli.mjs", ["watch", "src/worker.ts"], "server");
run("node_modules/next/dist/bin/next", ["dev", "--hostname", "127.0.0.1"], "client");
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const p of children) p.kill("SIGTERM");
  setTimeout(() => process.exit(0), 1500);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
