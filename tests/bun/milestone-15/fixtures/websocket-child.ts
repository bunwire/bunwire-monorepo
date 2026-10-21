import app, { activeServer } from "../../../fixtures/bun-milestone-15/src/bootstrap.js";
import { pathToFileURL } from "node:url";
const { applicationRegistry } = await import(pathToFileURL(process.argv[2]!).href);

app.withRuntimeRegistry(applicationRegistry);
await app.start();
console.log(`BUNWIRE_WEBSOCKET_READY ${activeServer().url}`);
for await (const chunk of Bun.stdin.stream()) {
  if (new TextDecoder().decode(chunk).includes("stop")) break;
}
await app.stop();
let stopped = false;
try { await fetch(activeServer().url); } catch { stopped = true; }
if (!stopped) throw new Error("Native Bun server still accepts requests after app.stop().");
console.log("BUNWIRE_WEBSOCKET_STOPPED");
