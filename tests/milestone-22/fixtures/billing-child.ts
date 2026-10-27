import { pathToFileURL } from "node:url";
import { BunAdapter, BUN_QUEUE_MANAGER, SyncQueueDriver, type BunHttpServer, type BunSchedulerClock } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";
import { Charge, deliveries, envelopes } from "../../fixtures/milestone-22-billing/jobs.js";
import { trace } from "../../fixtures/milestone-22-billing/middleware.js";

const { applicationRegistry } = await import(pathToFileURL(process.argv[2]!).href);
const policy = applicationRegistry.classes.find((entry: { target: unknown }) => entry.target === Charge)?.data;
if (policy?.queue !== "critical-billing" || policy.timeout !== 60_000 || policy.backoff.join() !== "1000,5000,30000")
  throw new Error("Compiled billing policy differs from imported constants");

const command = defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false,
  queues: { driver: new SyncQueueDriver() } })).withRuntimeRegistry(applicationRegistry);
await command.start();
try {
  const receipt = await command.rootContainer.get(BUN_QUEUE_MANAGER).job(Charge, "manual", { limit: 6 }).dispatch();
  if (receipt.queue !== "critical-billing" || deliveries[0]?.[0] !== "manual") throw new Error("Queue dispatch failed");
  const envelope = envelopes[0];
  if (!envelope || envelope.policy.timeout !== 60_000 || envelope.policy.backoff.join() !== "1000,5000,30000")
    throw new Error("Runtime retry/timeout policy differs from compiled policy");
} finally { await command.stop(); }

const clock: BunSchedulerClock = {
  now: () => Date.UTC(2026, 0, 1, 4, 30),
  waitUntil(_timestamp, signal) { return new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }); },
};
const scheduler = defineApp().withAdapter(new BunAdapter({ role: "scheduler", handleSignals: false,
  queues: { driver: new SyncQueueDriver() }, scheduler: { clock } })).withRuntimeRegistry(applicationRegistry);
await scheduler.start();
try {
  const deadline = Date.now() + 5000;
  while (deliveries.length < 2 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  if (!deliveries.some((args) => JSON.stringify(args) === JSON.stringify(["scheduled", { limit: 6 }])))
    throw new Error("Wrong scheduled job arguments");
} finally { await scheduler.stop(); }

let server!: BunHttpServer;
const http = defineApp().withAdapter(new BunAdapter({ role: "http", handleSignals: false,
  http: { hostname: "127.0.0.1", port: 0, onServer(value) { server = value; } } })).withRuntimeRegistry(applicationRegistry);
await http.start();
try {
  trace.length = 0;
  const response = await fetch(new URL("/admin/run", server.url));
  const body = await response.text();
  if (response.status !== 200 || JSON.parse(body) !== "admin") throw new Error(`Bun route failed: ${response.status} ${body} ${JSON.stringify(trace)}`);
  const labels = ["billing-auth", "billing-audit:global", "billing-audit:strict", "billing-can:admin.access", "billing-audit:controller", "billing-audit:method"];
  const expected = [...labels.map((label) => `before:${label}`), "handler", ...labels.reverse().map((label) => `after:${label}`)];
  if (JSON.stringify(trace) !== JSON.stringify(expected)) throw new Error(`Middleware order: ${JSON.stringify(trace)}`);
} finally { await http.stop(); }
console.log("BILLING_MILESTONE_22_OK");
