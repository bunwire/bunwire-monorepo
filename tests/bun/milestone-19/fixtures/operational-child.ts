import { BUN_HTTP_ROUTE_KIND, BUN_MAINTENANCE, BunAdapter, Get, type BunHttpServer } from "@bunwire/bun";
import { CONTROLLER_KIND, Controller, defineApp, defineManagedMethodPlan, defineRuntimeRegistry } from "@bunwire/core";

@Controller("/native")
class NativeController {
  @Get("/hello") hello(): Response { return new Response("hello"); }
}

const registry = defineRuntimeRegistry({
  classes: [{ kind: CONTROLLER_KIND, target: NativeController, data: { prefix: "/native" } }],
  methods: [defineManagedMethodPlan({ kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND,
    target: NativeController, method: "hello", data: { method: "GET", path: "/hello" }, parameters: [] })],
});

let server!: BunHttpServer;
const app = defineApp().withAdapter(new BunAdapter({
  handleSignals: false,
  http: { hostname: "127.0.0.1", port: 0, health: {},
    maintenance: { retryAfterSeconds: 12, authorizeBypass: (request) => request.headers.get("X-Operator-Key") === "valid" },
    onServer(value) { server = value; } },
})).withRuntimeRegistry(registry);

await app.start();
console.log(`BUNWIRE_OPERATIONAL_READY ${server.url}`);
let input = "";
for await (const chunk of Bun.stdin.stream()) {
  input += new TextDecoder().decode(chunk);
  while (input.includes("\n")) {
    const index = input.indexOf("\n");
    const command = input.slice(0, index).trim();
    input = input.slice(index + 1);
    if (command === "enable") { app.rootContainer.get(BUN_MAINTENANCE).enable(); console.log("BUNWIRE_MAINTENANCE_ON"); }
    if (command === "disable") { app.rootContainer.get(BUN_MAINTENANCE).disable(); console.log("BUNWIRE_MAINTENANCE_OFF"); }
    if (command === "stop") { await app.stop(); console.log("BUNWIRE_OPERATIONAL_STOPPED"); process.exit(0); }
  }
}
