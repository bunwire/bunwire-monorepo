import { defineApp } from "@bunwire/core";
import { BunAdapter } from "@bunwire/bun";
import { TestBrokerDriver } from "./driver.js";
export default defineApp().withAdapter(new BunAdapter({ role: "worker", queues: { driver: new TestBrokerDriver(), worker: { pollIntervalMs: 20, leaseDurationMs: 600 } } }));
