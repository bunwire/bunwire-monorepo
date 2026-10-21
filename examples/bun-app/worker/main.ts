import { BUN_QUEUE_MANAGER, BUN_QUEUE_WORKER } from "@bunwire/bun";
import { EventDispatcher } from "@bunwire/core";
import app from "./src/bootstrap.js";
import registry from "./.bunwire/registry.js";
import { DemoProgress, FailPermanently, Greet, Welcome } from "./src/work.js";

try {
  await app.withRuntimeRegistry(registry).start();
  const worker = app.rootContainer.get(BUN_QUEUE_WORKER);
  if (process.argv.includes("--demo")) {
    const demo = async () => {
      const queues = app.rootContainer.get(BUN_QUEUE_MANAGER);
      await queues.job(Greet, "Bunwire").dispatch();
      await queues.job(FailPermanently, "Bunwire").dispatch();
      await app.rootContainer.get(EventDispatcher).dispatch(new Welcome("Bunwire"));
      await app.rootContainer.get(DemoProgress).done;
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const failed = (await queues.listFailed()).find((entry) => entry.envelope.job === "example.worker-permanent-failure");
        if (failed) { console.log(`FAILED_JOB ${failed.envelope.job} attempt=${failed.envelope.attempts} reason=${failed.reason}`); return; }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error("Permanent failure was not recorded by the worker.");
    };
    // Observe infrastructure failures even while waiting for demonstration work.
    await Promise.race([demo(), worker.done]);
  } else {
    await worker.done;
  }
} finally {
  await app.stop();
}
