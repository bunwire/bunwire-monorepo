import applicationRegistry from "../.bunwire/registry.js";
import { BUN_MAINTENANCE, BUN_QUEUE_MANAGER } from "@bunwire/bun";
import app from "./bootstrap.js";

await app.withRuntimeRegistry(applicationRegistry).start();
if (process.env.BUNWIRE_EXAMPLE_INTEGRATED === "1") {
  app.rootContainer.get(BUN_QUEUE_MANAGER).createWorker().start();
  process.stdin.setEncoding("utf8");
  let inputBuffer = "";
  process.stdin.on("data", (input: string) => {
    inputBuffer += input;
    while (inputBuffer.includes("\n")) {
      const end = inputBuffer.indexOf("\n");
      const command = inputBuffer.slice(0, end).trim();
      inputBuffer = inputBuffer.slice(end + 1);
      if (command === "maintenance:on") {
        app.rootContainer.get(BUN_MAINTENANCE).enable();
        console.log("BUNWIRE_EXAMPLE_MAINTENANCE_ON");
      } else if (command === "maintenance:off") {
        app.rootContainer.get(BUN_MAINTENANCE).disable();
        console.log("BUNWIRE_EXAMPLE_MAINTENANCE_OFF");
      } else if (command === "stop") {
        void app.stop().then(() => { console.log("BUNWIRE_EXAMPLE_STOPPED"); process.exit(0); },
          (error: unknown) => { console.error(error); process.exit(1); });
      }
    }
  });
}
