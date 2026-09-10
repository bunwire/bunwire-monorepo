import { BunAdapter, MemoryQueueDriver } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";
import { welcomeCodec } from "./work.js";

export default defineApp().withAdapter(new BunAdapter({
  role: "worker",
  queues: {
    driver: new MemoryQueueDriver(),
    eventCodecs: [welcomeCodec],
    worker: { concurrency: 2, pollIntervalMs: 20 },
  },
}));
