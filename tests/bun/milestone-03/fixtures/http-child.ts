import {
  BUN_HTTP_ROUTE_KIND,
  BunAdapter,
  Get,
  type BunHttpServer,
} from "@bunwire/bun";
import {
  CONTROLLER_KIND,
  Controller,
  defineApp,
  defineManagedMethodPlan,
  defineRuntimeRegistry,
} from "@bunwire/core";
import { applicationRegistry } from "../../../../examples/bun-app/.bunwire/registry.js";

@Controller("/test")
class FailureController {
  @Get("/failure")
  failure(): Response { throw new Error("expected failure"); }

  @Get("/unsupported")
  unsupported(): string { return "not a response"; }
}

const combinedRegistry = defineRuntimeRegistry({
  classes: [
    ...applicationRegistry.classes,
    { kind: CONTROLLER_KIND, target: FailureController, data: { prefix: "/test" } },
  ],
  providers: applicationRegistry.providers,
  methods: [
    ...applicationRegistry.methods,
    defineManagedMethodPlan({
      kind: BUN_HTTP_ROUTE_KIND,
      ownerKind: CONTROLLER_KIND,
      target: FailureController,
      method: "failure",
      data: { method: "GET", path: "/failure" },
      parameters: [],
    }),
    defineManagedMethodPlan({
      kind: BUN_HTTP_ROUTE_KIND,
      ownerKind: CONTROLLER_KIND,
      target: FailureController,
      method: "unsupported",
      data: { method: "GET", path: "/unsupported" },
      parameters: [],
    }),
  ],
  events: applicationRegistry.events,
  eventAliases: applicationRegistry.eventAliases,
});

let server!: BunHttpServer;
const app = defineApp()
  .withAdapter(new BunAdapter({
    handleSignals: false,
    http: {
      hostname: "127.0.0.1",
      port: 0,
      onServer(value) { server = value; },
    },
  }))
  .withRuntimeRegistry(combinedRegistry);

await app.start();
console.log(`BUNWIRE_HTTP_READY ${server.url}`);

for await (const chunk of Bun.stdin.stream()) {
  if (new TextDecoder().decode(chunk).includes("stop")) break;
}
await app.stop();
console.log("BUNWIRE_HTTP_STOPPED");
