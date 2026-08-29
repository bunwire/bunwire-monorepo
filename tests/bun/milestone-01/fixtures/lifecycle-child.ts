import { appendFile } from "node:fs/promises";
import { BunAdapter, type BunRuntimeContext } from "@bunwire/bun";
import {
  defineApp,
  defineRuntimeRegistry,
  type AdapterHostContext,
} from "@bunwire/core";

const mode = process.argv[2];
const markerPath = process.argv[3];
if ((mode !== "normal" && mode !== "signal") || !markerPath) {
  throw new Error("Expected lifecycle child mode and marker path.");
}

class RecordingBunAdapter extends BunAdapter {
  static override readonly compiler = BunAdapter.compiler;

  protected override async stopHost(context: AdapterHostContext<BunRuntimeContext>): Promise<void> {
    await super.stopHost(context);
    await appendFile(markerPath, `stopped:${context.applicationContext.role}\n`, "utf8");
  }
}

const app = defineApp()
  .withAdapter(new RecordingBunAdapter({ handleSignals: mode === "signal" }))
  .withRuntimeRegistry(defineRuntimeRegistry());

await app.start();
await appendFile(markerPath, `started:${app.state}\n`, "utf8");
console.log("BUNWIRE_CHILD_STARTED");

if (mode === "normal") {
  await app.stop();
  console.log(`BUNWIRE_CHILD_${app.state.toUpperCase()}`);
} else {
  process.stdin.once("data", (chunk) => {
    const signal = chunk.toString().trim();
    if (signal !== "SIGINT" && signal !== "SIGTERM") {
      throw new Error(`Unsupported test signal ${JSON.stringify(signal)}.`);
    }
    process.emit(signal);
  });
  process.stdin.resume();
  setInterval(() => {}, 1_000);
}
