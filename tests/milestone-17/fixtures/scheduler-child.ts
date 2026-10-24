import { pathToFileURL } from "node:url";
import { defineApp } from "@bunwire/core";
import { BunAdapter, SyncQueueDriver, type BunSchedulerClock } from "@bunwire/bun";
import { delivered, deliveries } from "../../fixtures/milestone-17-policy/bun/src/jobs.js";
const { applicationRegistry } = await import(pathToFileURL(process.argv[2]!).href);
const clock: BunSchedulerClock = {
  now: () => Date.UTC(2026, 0, 1, 4, 30),
  waitUntil(_timestamp, signal) { return new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }); },
};
const app = defineApp().withAdapter(new BunAdapter({ role: "scheduler", handleSignals: false,
  queues: { driver: new SyncQueueDriver() }, scheduler: { clock } })).withRuntimeRegistry(applicationRegistry);
let timeout: ReturnType<typeof setTimeout> | undefined;
try {
  await app.start();
  await Promise.race([delivered, new Promise((_resolve, reject) => { timeout = setTimeout(() => reject(new Error("Scheduled job not delivered")), 5000); })]);
  if (JSON.stringify(deliveries) !== JSON.stringify([["daily", { limit: 6 }]])) throw new Error("Wrong scheduled arguments");
} finally { if (timeout) clearTimeout(timeout); await app.stop(); }
console.log("COMPOSED_SCHEDULE_OK");
