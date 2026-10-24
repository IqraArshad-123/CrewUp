import { MongoMemoryReplSet } from "mongodb-memory-server";
import path from "node:path";
async function main() {
  const repl = await MongoMemoryReplSet.create({
    binary: { downloadDir: path.resolve(".data/bin") },
    instanceOpts: [{ port: 27018 }],
    replSet: {
      name: "crewup",
      count: 1,
      storageEngine: "wiredTiger",
      ip: "127.0.0.1",
    },
  });
  console.log(
    "Isolated test MongoDB ready on 127.0.0.1:27018. App data remains in Atlas.",
  );
  const stop = async () => {
    await repl.stop({ doCleanup: true, force: false });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
