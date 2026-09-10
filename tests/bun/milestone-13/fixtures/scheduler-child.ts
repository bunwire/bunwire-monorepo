import { BUN_SCHEDULER } from "@bunwire/bun";
import app from "../../../../examples/bun-app/scheduler/src/bootstrap.js";
import registry from "../../../../examples/bun-app/scheduler/.bunwire/registry.js";

process.stdin.on("data", (chunk) => {
  const signal = chunk.toString().trim();
  if (signal === "SIGINT" || signal === "SIGTERM") process.emit(signal);
});
process.stdin.resume();

try {
  await app.withRuntimeRegistry(registry).start();
  await app.rootContainer.get(BUN_SCHEDULER).done;
} finally {
  process.stdin.pause();
  await app.stop();
}
