import {
  BUN_HTTP_CONTEXT_RESOLVER_ID,
  BUN_HTTP_ROUTE_KIND,
  BUN_FORM_REQUEST_RESOLVER_ID,
  BUN_REQUEST_KIND,
  AuthenticateMiddleware,
  AuthorizeMiddleware,
  BunAdapter,
  Get,
  GuestMiddleware,
  FormRequest,
  Request as BunRequest,
  createSessionAuthGuard,
  type BunHttpContext,
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Principal { readonly id: string; readonly role: "admin" | "member"; }

@BunRequest()
class AdminRequest extends FormRequest<{ value?: string }> {
  static authorizationCalls = 0;
  static rulesCalls = 0;
  override async authorize(): Promise<boolean> {
    AdminRequest.authorizationCalls += 1;
    return this.context.authorization!.can("dashboard.view");
  }
  override rules() {
    AdminRequest.rulesCalls += 1;
    return { value: ["optional", "string"] };
  }
}

@Controller("/security")
class SecurityController {
  static formCalls = 0;
  @Get("/public")
  public(context: BunHttpContext<Principal>): object {
    return { guest: context.auth!.guest() };
  }
  @Get("/login")
  async login(context: BunHttpContext<Principal>): Promise<object> {
    await context.auth!.login({ id: "user-1", role: "admin" });
    return { id: context.auth!.principal!.id };
  }
  @Get("/account")
  account(context: BunHttpContext<Principal>): object {
    return { id: context.auth!.principal!.id };
  }
  @Get("/guest")
  guest(): object { return { guest: true }; }
  @Get("/posts/:post")
  post(context: BunHttpContext<Principal>): object {
    return { post: context.route.params.post };
  }
  @Get("/logout")
  async logout(context: BunHttpContext<Principal>): Promise<object> {
    await context.auth!.logout();
    return { guest: context.auth!.guest() };
  }
  @Get("/form")
  form(_request: AdminRequest): object {
    SecurityController.formCalls += 1;
    return { valid: true };
  }
}

const parameter = [{ source: "resolver" as const, methodIndex: 0, resolverId: BUN_HTTP_CONTEXT_RESOLVER_ID }];
const method = (
  name: keyof SecurityController,
  path: string,
  middleware: readonly ReturnType<typeof defineMiddlewareAttachment>[] = [],
) => defineManagedMethodPlan({
  kind: BUN_HTTP_ROUTE_KIND,
  ownerKind: CONTROLLER_KIND,
  target: SecurityController,
  method: name,
  data: { method: "GET", path },
  parameters: name === "guest" ? [] : parameter,
  middleware,
});

const registry = defineRuntimeRegistry({
  classes: [
    { kind: CONTROLLER_KIND, target: SecurityController, data: { prefix: "/security" } },
    defineMiddlewareDefinition({ target: AuthenticateMiddleware, data: { alias: "auth" } }),
    defineMiddlewareDefinition({ target: GuestMiddleware, data: { alias: "guest" } }),
    defineMiddlewareDefinition({ target: AuthorizeMiddleware, data: { alias: "can" } }),
    { kind: BUN_REQUEST_KIND, target: AdminRequest, data: { type: "request" }, dependencies: [] },
  ],
  methods: [
    method("public", "/public"),
    method("login", "/login"),
    method("account", "/account", [defineMiddlewareAttachment(AuthenticateMiddleware)]),
    method("guest", "/guest", [defineMiddlewareAttachment(GuestMiddleware)]),
    method("post", "/posts/:post", [defineMiddlewareAttachment(AuthorizeMiddleware, ["update", "post"])]),
    method("logout", "/logout", [defineMiddlewareAttachment(AuthenticateMiddleware)]),
    defineManagedMethodPlan({
      kind: BUN_HTTP_ROUTE_KIND,
      ownerKind: CONTROLLER_KIND,
      target: SecurityController,
      method: "form",
      data: { method: "GET", path: "/form" },
      parameters: [{
        source: "resolver",
        methodIndex: 0,
        resolverId: BUN_FORM_REQUEST_RESOLVER_ID,
        token: AdminRequest,
      }],
    }),
  ],
});

type Handler = (request: Request, server: object) => Promise<Response>;
let previousBun: PropertyDescriptor | undefined;
let routes: Record<string, Record<string, Handler>>;
const server = { stop: vi.fn().mockResolvedValue(undefined) };

beforeEach(() => {
  previousBun = Object.getOwnPropertyDescriptor(globalThis, "Bun");
  Object.defineProperty(globalThis, "Bun", { configurable: true, value: {
    serve: (options: { routes: typeof routes }) => { routes = options.routes; return server; },
  } });
});

afterEach(() => {
  if (previousBun) Object.defineProperty(globalThis, "Bun", previousBun);
  else Reflect.deleteProperty(globalThis, "Bun");
});

function request(path: string, cookie?: string, params: Record<string, string> = {}): Request {
  return Object.assign(new globalThis.Request(`http://local${path}`, {
    ...(cookie ? { headers: { Cookie: cookie } } : {}),
  }), { params });
}

function application(registryOverride = registry) {
  return defineApp().withAdapter(new BunAdapter<Principal>({ handleSignals: false, http: {
    sessions: { secret: "0123456789abcdef0123456789abcdef", cookie: { secure: false } },
    auth: {
      defaultGuard: "session",
      guards: [createSessionAuthGuard({
        identify: (principal: Principal) => principal.id,
        resolve: (id: string) => id === "user-1" ? { id, role: "admin" } : undefined,
      })],
    },
    authorization: {
      abilities: { "dashboard.view": ({ principal }) => principal?.role === "admin" },
      policies: [{
        name: "post",
        resolve: (id) => ({ id, owner: "user-1" }),
        abilities: { update: ({ principal, resource }) => principal?.id === resource.owner },
      }],
    },
  } })).withRuntimeRegistry(registryOverride);
}

describe("Bun Milestone 8 — security HTTP runtime", () => {
  it("eagerly exposes auth and completes login, restoration, middleware, policy, and logout", async () => {
    const app = application();
    await app.start();
    const anonymous = await routes["/security/public"]!.GET!(request("/security/public"), server);
    expect(await anonymous.json()).toEqual({ guest: true });

    const denied = await routes["/security/account"]!.GET!(request("/security/account"), server);
    expect(denied.status).toBe(401);

    const login = await routes["/security/login"]!.GET!(request("/security/login"), server);
    expect(await login.json()).toEqual({ id: "user-1" });
    const cookie = login.headers.get("set-cookie")!.split(";", 1)[0]!;

    const account = await routes["/security/account"]!.GET!(request("/security/account", cookie), server);
    expect(await account.json()).toEqual({ id: "user-1" });
    const refreshed = account.headers.get("set-cookie")!.split(";", 1)[0]!;
    const guest = await routes["/security/guest"]!.GET!(request("/security/guest", refreshed), server);
    expect(guest.status).toBe(403);

    const allowed = await routes["/security/posts/:post"]!.GET!(request("/security/posts/42", refreshed, { post: "42" }), server);
    expect(await allowed.json()).toEqual({ post: "42" });

    const logout = await routes["/security/logout"]!.GET!(request("/security/logout", refreshed), server);
    expect(await logout.json()).toEqual({ guest: true });
    const loggedOut = logout.headers.get("set-cookie")!.split(";", 1)[0]!;
    const after = await routes["/security/account"]!.GET!(request("/security/account", loggedOut), server);
    expect(after.status).toBe(401);
    await app.stop();
  });

  it("validates session-backed auth and generated middleware configuration before serving", async () => {
    expect(() => new BunAdapter({ http: { auth: {
      defaultGuard: "session",
      guards: [createSessionAuthGuard({ identify: (value: object) => JSON.stringify(value), resolve: () => ({}) })],
    } } })).toThrow(/require configured.*sessions/i);

    const invalid = defineRuntimeRegistry({
      classes: registry.classes,
      methods: [method("account", "/account", [defineMiddlewareAttachment(AuthenticateMiddleware, ["missing"])])],
    });
    await expect(application(invalid).start()).rejects.toThrow(/guard.*missing.*not registered/i);
  });

  it("runs Form Request authorization before rules and controller execution", async () => {
    AdminRequest.authorizationCalls = 0;
    AdminRequest.rulesCalls = 0;
    SecurityController.formCalls = 0;
    const app = application();
    await app.start();
    const denied = await routes["/security/form"]!.GET!(request("/security/form"), server);
    expect(denied.status).toBe(403);
    expect(AdminRequest.authorizationCalls).toBe(1);
    expect(AdminRequest.rulesCalls).toBe(0);
    expect(SecurityController.formCalls).toBe(0);

    const login = await routes["/security/login"]!.GET!(request("/security/login"), server);
    const cookie = login.headers.get("set-cookie")!.split(";", 1)[0]!;
    const allowed = await routes["/security/form"]!.GET!(request("/security/form", cookie), server);
    expect(allowed.status).toBe(200);
    expect(AdminRequest.rulesCalls).toBe(1);
    expect(SecurityController.formCalls).toBe(1);
    await app.stop();
  });
});
