import { pathToFileURL } from "node:url";
import app, { server } from "../../../fixtures/bun-milestone-10/src/bootstrap.js";

const { applicationRegistry } = await import(pathToFileURL(process.argv[2]!).href);
await app.withRuntimeRegistry(applicationRegistry).start();
console.log(`BUNWIRE_EVENTS_READY ${server.url}`);
process.stdin.once("data", async () => {
  await app.stop();
  console.log(`BUNWIRE_EVENTS_STOPPED ${app.state}`);
  process.stdin.pause();
});
