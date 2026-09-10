import { Controller, defineApp, defineManagedMethodPlan, defineRuntimeRegistry, getManagedClassMetadata } from "@bunwire/core";
import { Argument, BUN_COMMAND_HANDLE_KIND, BUN_COMMAND_KIND, BUN_HTTP_ROUTE_KIND, BunAdapter, Command, Get, Option, runBunCli } from "@bunwire/bun";

@Command("greet") class Greet { handle(name: string, count: number): number { console.log(Array.from({ length: count }, () => `Hello ${name}`).join("|")); return 7; } }
@Controller() class Health { @Get("/health") show(): Response { return new Response("healthy"); } }
const command = defineManagedMethodPlan({ target: Greet, ownerKind: BUN_COMMAND_KIND, kind: BUN_COMMAND_HANDLE_KIND, method: "handle", data: undefined, parameters: [
  { source: "resolver", methodIndex: 0, resolverId: Argument.definition.resolverId, data: Argument.definition.createMetadata("name") },
  { source: "resolver", methodIndex: 1, resolverId: Option.definition.resolverId, data: Option.definition.createMetadata({ name: "count", alias: "c", type: "integer", default: 1 }) },
] });
const health = defineManagedMethodPlan({ target: Health, ownerKind: Controller.definition.kind, kind: BUN_HTTP_ROUTE_KIND, method: "show", data: Get.definition.createMetadata("/health"), parameters: [] });
const registry = defineRuntimeRegistry({ classes: [
  { target: Greet, kind: BUN_COMMAND_KIND, scope: "transient", data: getManagedClassMetadata(Greet)!.data },
  { target: Health, kind: Controller.definition.kind, data: getManagedClassMetadata(Health)!.data },
], methods: [command, health] });
const app = defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: true, http: { port: 0, onServer(server) { console.log(`COMMAND_SERVER_READY ${server.url}`); } } }));
process.exitCode = await runBunCli(app, registry);
