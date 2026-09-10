import { defineApp } from "@bunwire/core";
import { BunAdapter, SyncQueueDriver } from "@bunwire/bun";
export default defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false, queues: { driver: new SyncQueueDriver() } }));
