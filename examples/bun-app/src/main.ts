import applicationRegistry from "../.bunwire/registry.js";
import { BUN_QUEUE_MANAGER } from "@bunwire/bun";
import app from "./bootstrap.js";

await app.withRuntimeRegistry(applicationRegistry).start();
if (process.env.BUNWIRE_EXAMPLE_INTEGRATED === "1") {
  app.rootContainer.get(BUN_QUEUE_MANAGER).createWorker().start();
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (input: string) => {
    if (!input.includes("stop")) return;
    void app.stop().then(() => { console.log("BUNWIRE_EXAMPLE_STOPPED"); process.exit(0); },
      (error: unknown) => { console.error(error); process.exit(1); });
  });
}
