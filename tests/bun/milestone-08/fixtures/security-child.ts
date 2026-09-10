import {
  BUN_HTTP_CONTEXT_RESOLVER_ID,
  BUN_HTTP_ROUTE_KIND,
  AuthenticateMiddleware,
  AuthorizeMiddleware,
  BunAdapter,
  Get,
  createSessionAuthGuard,
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

interface Principal { readonly id: string; }

@Controller()
class SecurityController {
  @Get("/login")
  async login(context: BunHttpContext<Principal>): Promise<object> {
    await context.auth!.login({ id: "user-1" });
    return { authenticated: context.auth!.check() };
  }
  @Get("/account")
  account(context: BunHttpContext<Principal>): object { return { id: context.auth!.principal!.id }; }
  @Get("/posts/:post")
  post(context: BunHttpContext<Principal>): object { return { post: context.route.params.post }; }
  @Get("/logout")
  async logout(context: BunHttpContext<Principal>): Promise<object> {
    await context.auth!.logout();
    return { guest: context.auth!.guest() };
  }
}

const context = [{ source: "resolver" as const, methodIndex: 0, resolverId: BUN_HTTP_CONTEXT_RESOLVER_ID }];
const auth = defineMiddlewareAttachment(AuthenticateMiddleware);
const registry = defineRuntimeRegistry({
  classes: [
    { kind: CONTROLLER_KIND, target: SecurityController, data: { prefix: "" } },
    defineMiddlewareDefinition({ target: AuthenticateMiddleware, data: { alias: "auth" } }),
    defineMiddlewareDefinition({ target: AuthorizeMiddleware, data: { alias: "can" } }),
  ],
  methods: [
    defineManagedMethodPlan({ kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND, target: SecurityController, method: "login", data: { method: "GET", path: "/login" }, parameters: context }),
    defineManagedMethodPlan({ kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND, target: SecurityController, method: "account", data: { method: "GET", path: "/account" }, parameters: context, middleware: [auth] }),
    defineManagedMethodPlan({ kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND, target: SecurityController, method: "post", data: { method: "GET", path: "/posts/:post" }, parameters: context, middleware: [auth, defineMiddlewareAttachment(AuthorizeMiddleware, ["view", "post"])] }),
    defineManagedMethodPlan({ kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND, target: SecurityController, method: "logout", data: { method: "GET", path: "/logout" }, parameters: context, middleware: [auth] }),
  ],
});

let server!: BunHttpServer;
const app = defineApp().withAdapter(new BunAdapter<Principal>({ handleSignals: false, http: {
  hostname: "127.0.0.1",
  port: 0,
  sessions: { secret: "0123456789abcdef0123456789abcdef", cookie: { secure: false } },
  auth: {
    defaultGuard: "session",
    guards: [createSessionAuthGuard({
      identify: (principal: Principal) => principal.id,
      resolve: (id: string) => id === "user-1" ? { id } : undefined,
    })],
  },
  authorization: {
    policies: [{
      name: "post",
      resolve: (id) => ({ id, owner: id === "owned" ? "user-1" : "other" }),
      abilities: { view: ({ principal, resource }) => principal?.id === resource.owner },
    }],
  },
  onServer(value) { server = value; },
} })).withRuntimeRegistry(registry);

await app.start();
console.log(`BUNWIRE_SECURITY_READY ${server.url}`);
for await (const chunk of Bun.stdin.stream()) {
  if (new TextDecoder().decode(chunk).includes("stop")) break;
}
await app.stop();
console.log("BUNWIRE_SECURITY_STOPPED");
