import { BunAdapter, SyncQueueDriver } from "@bunwire/bun";
import { EventDispatcher, defineApp, defineRuntimeRegistry } from "@bunwire/core";
import generated from "../../../../examples/bun-app/.bunwire/registry.js";
import { ExampleActionRecorded, ExampleEventAudit, ExampleQueuedAudit, actionCodec } from "../../../../examples/bun-app/src/events.js";

const event = generated.events.find((entry) => entry.target === ExampleActionRecorded)!;
const targets = new Set<Function>([event.target, ExampleEventAudit, ExampleQueuedAudit, ...event.listeners.map((entry) => entry.target)]);
const registry = defineRuntimeRegistry({
  classes: generated.classes.filter((entry) => targets.has(entry.target)),
  methods: event.listeners.map((entry) => entry.handle), events: [event],
  eventAliases: generated.eventAliases.filter((entry) => entry.event === event),
  classAttachments: generated.classAttachments!.filter((entry) => targets.has(entry.target)),
});
const app = defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false,
  queues: { driver: new SyncQueueDriver(), eventCodecs: [actionCodec] },
})).withRuntimeRegistry(registry);
try {
  await app.start(); await app.rootContainer.get(EventDispatcher).dispatch(new ExampleActionRecorded("example"));
  for (const audit of [ExampleEventAudit, ExampleQueuedAudit]) {
    if (JSON.stringify(app.rootContainer.get(audit).records) !== '["example"]') throw new Error("Generated example listener did not deliver exactly once.");
  }
} finally { await app.stop(); }
console.log(`EXAMPLE_EVENTS_OK ${app.state}`);
