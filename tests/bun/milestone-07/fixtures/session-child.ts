import {
  BUN_HTTP_CONTEXT_RESOLVER_ID,
  BUN_HTTP_ROUTE_KIND,
  BunAdapter,
  CsrfMiddleware,
  Get,
  Post,
  type BunHttpContext,
  type BunHttpServer,
} from "@bunwire/bun";
import {
  CONTROLLER_KIND,
  Controller,
  defineApp,
  defineManagedMethodPlan,
  defineMiddlewareAttachment,
  defineMiddlewareDefinition,
  defineRuntimeRegistry,
} from "@bunwire/core";

@Controller("/state")
class StateController {
  @Get()
  async read(context: BunHttpContext): Promise<object> {
    return {
      count: context.session!.get("count") ?? 0,
      flash: context.session!.get("flash") ?? null,
      token: await context.csrf!.token(),
    };
  }

  @Post()
  write(context: BunHttpContext): object {
    const count = (context.session!.get<number>("count") ?? 0) + 1;
    context.session!.put("count", count).flash("flash", "saved");
    return { count };
  }
}

const parameter = [{ source: "resolver" as const, methodIndex: 0, resolverId: BUN_HTTP_CONTEXT_RESOLVER_ID }];
const registry = defineRuntimeRegistry({
  classes: [
    { kind: CONTROLLER_KIND, target: StateController, data: { prefix: "/state" } },
    defineMiddlewareDefinition({ target: CsrfMiddleware, data: { alias: "csrf" } }),
  ],
  methods: [
    defineManagedMethodPlan({ kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND, target: StateController, method: "read", data: { method: "GET", path: "/" }, parameters: parameter }),
    defineManagedMethodPlan({ kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND, target: StateController, method: "write", data: { method: "POST", path: "/" }, parameters: parameter, middleware: [defineMiddlewareAttachment(CsrfMiddleware)] }),
  ],
});

let server!: BunHttpServer;
const app = defineApp().withAdapter(new BunAdapter({ handleSignals: false, http: {
  hostname: "127.0.0.1", port: 0,
  sessions: { secret: "0123456789abcdef0123456789abcdef", cookie: { secure: false } },
  onServer(value) { server = value; },
} })).withRuntimeRegistry(registry);

await app.start();
console.log(`BUNWIRE_SESSION_READY ${server.url}`);
for await (const chunk of Bun.stdin.stream()) {
  if (new TextDecoder().decode(chunk).includes("stop")) break;
}
await app.stop();
console.log("BUNWIRE_SESSION_STOPPED");
