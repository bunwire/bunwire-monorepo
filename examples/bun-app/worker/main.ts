import { BUN_QUEUE_MANAGER, BUN_QUEUE_WORKER } from "@bunwire/bun";
import { EventDispatcher } from "@bunwire/core";
import app from "./src/bootstrap.js";
import registry from "./.bunwire/registry.js";
import { DemoProgress, Greet, Welcome } from "./src/work.js";

try {
  await app.withRuntimeRegistry(registry).start();
  const worker = app.rootContainer.get(BUN_QUEUE_WORKER);
  if (process.argv.includes("--demo")) {
    const demo = async () => {
      await app.rootContainer.get(BUN_QUEUE_MANAGER).job(Greet, "Bunwire").dispatch();
      await app.rootContainer.get(EventDispatcher).dispatch(new Welcome("Bunwire"));
      await app.rootContainer.get(DemoProgress).done;
    };
    // Observe infrastructure failures even while waiting for demonstration work.
    await Promise.race([demo(), worker.done]);
  } else {
    await worker.done;
  }
} finally {
  await app.stop();
}
