import { BUN_SCHEDULER } from "@bunwire/bun";
import app from "./src/bootstrap.js";
import registry from "./.bunwire/registry.js";
import { SchedulerDemoProgress } from "./src/work.js";

try {
  await app.withRuntimeRegistry(registry).start();
  const scheduler = app.rootContainer.get(BUN_SCHEDULER);
  if (process.argv.includes("--demo")) {
    await Promise.race([app.rootContainer.get(SchedulerDemoProgress).done, scheduler.done]);
  } else {
    await scheduler.done;
  }
} finally {
  await app.stop();
  console.log("SCHEDULER_STOPPED");
}
