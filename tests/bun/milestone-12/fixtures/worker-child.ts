import { pathToFileURL } from "node:url";
import { BUN_QUEUE_WORKER } from "@bunwire/bun";
import app from "../../../fixtures/bun-milestone-12-worker/src/bootstrap.js";
const { applicationRegistry } = await import(pathToFileURL(process.argv[2]!).href);
try {
  await app.withRuntimeRegistry(applicationRegistry).start();
  process.stdin.on("data", (chunk) => {
    const command = chunk.toString().trim();
    if (command === "STOP") void app.stop().catch(() => undefined);
    else if (command === "SIGINT" || command === "SIGTERM") process.emit(command);
  });
  process.stdin.resume();
  console.log("WORKER_READY");
  try { await app.rootContainer.get(BUN_QUEUE_WORKER).done; }
  finally { await app.stop(); }
  console.log(`WORKER_${app.state.toUpperCase()}`);
} catch (error) { console.error(error); process.exitCode = 1; }
finally { process.stdin.pause(); }
