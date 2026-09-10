import {
  BUN_HTTP_CONTEXT_RESOLVER_ID,
  BUN_HTTP_ROUTE_KIND,
  BunAdapter,
  CsrfMiddleware,
  Get,
  Post,
  type BunHttpContext,
  type BunSessionStoreRecord,
  type SessionStore,
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

@Controller("/csrf")
class CsrfController {
  @Get("/token")
  async token(context: BunHttpContext): Promise<object> { return { token: await context.csrf!.token() }; }

  @Post("/submit")
  submit(context: BunHttpContext): object {
    const count = (context.session!.get<number>("count") ?? 0) + 1;
    context.session!.put("count", count);
    return { count };
  }
}

const contextParameter = [{ source: "resolver" as const, methodIndex: 0, resolverId: BUN_HTTP_CONTEXT_RESOLVER_ID }];
const registry = defineRuntimeRegistry({
  classes: [
    { kind: CONTROLLER_KIND, target: CsrfController, data: { prefix: "/csrf" } },
    defineMiddlewareDefinition({ target: CsrfMiddleware, data: { alias: "csrf" } }),
  ],
  methods: [
    defineManagedMethodPlan({ kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND, target: CsrfController, method: "token", data: { method: "GET", path: "/token" }, parameters: contextParameter, middleware: [defineMiddlewareAttachment(CsrfMiddleware)] }),
    defineManagedMethodPlan({ kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND, target: CsrfController, method: "submit", data: { method: "POST", path: "/submit" }, parameters: contextParameter, middleware: [defineMiddlewareAttachment(CsrfMiddleware)] }),
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

function request(path: string, init: RequestInit = {}): Request {
  return Object.assign(new Request(`http://local${path}`, init), { params: {} });
}

describe("Bun Milestone 7 — session HTTP and CSRF runtime", () => {
  it("validates configuration eagerly and rejects csrf middleware without sessions", async () => {
    expect(() => new BunAdapter({ http: { sessions: { secret: "short" } } })).toThrow(/32 UTF-8 bytes/i);
    expect(() => new BunAdapter({ http: { csrf: {} } })).toThrow(/require configured sessions/i);
    const app = defineApp().withAdapter(new BunAdapter({ handleSignals: false })).withRuntimeRegistry(registry);
    await expect(app.start()).rejects.toThrow(/csrf middleware requires configured.*sessions/i);
  });

  it("routes session commit failures through the central exception boundary", async () => {
    const store: SessionStore = {
      async read(): Promise<BunSessionStoreRecord | undefined> { return undefined; },
      async write(): Promise<void> { throw new Error("store unavailable"); },
      async destroy(): Promise<void> {},
    };
    const app = defineApp().withAdapter(new BunAdapter({ handleSignals: false, http: {
      sessions: { secret: "0123456789abcdef0123456789abcdef", store, cookie: { secure: false } },
    } })).withRuntimeRegistry(registry);
    await app.start();
    const response = await routes["/csrf/token"]!.GET!(request("/csrf/token"), server);
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Internal Server Error");
    expect(response.headers.has("set-cookie")).toBe(false);
    await app.stop();
  });

  it("makes application shutdown wait for an active session commit", async () => {
    let beginWrite!: () => void;
    const writing = new Promise<void>((resolve) => { beginWrite = resolve; });
    let finishWrite!: () => void;
    const releaseWrite = new Promise<void>((resolve) => { finishWrite = resolve; });
    const store: SessionStore = {
      async read(): Promise<BunSessionStoreRecord | undefined> { return undefined; },
      async write(): Promise<void> { beginWrite(); await releaseWrite; },
      async destroy(): Promise<void> {},
    };
    const app = defineApp().withAdapter(new BunAdapter({ handleSignals: false, http: {
      sessions: { secret: "0123456789abcdef0123456789abcdef", store, cookie: { secure: false } },
    } })).withRuntimeRegistry(registry);
    await app.start();
    const response = routes["/csrf/token"]!.GET!(request("/csrf/token"), server);
    await writing;
    let stopped = false;
    const stopping = app.stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    finishWrite();
    expect((await response).status).toBe(200);
    await stopping;
    expect(stopped).toBe(true);
  });

  it("restores a signed session and verifies header/form tokens through the central 419 path", async () => {
    const app = defineApp().withAdapter(new BunAdapter({ handleSignals: false, http: {
      sessions: { secret: "0123456789abcdef0123456789abcdef", cookie: { secure: false } },
    } })).withRuntimeRegistry(registry);
    await app.start();

    const tokenResponse = await routes["/csrf/token"]!.GET!(request("/csrf/token"), server);
    const token = (await tokenResponse.json() as { token: string }).token;
    const cookie = tokenResponse.headers.get("set-cookie")!.split(";", 1)[0]!;

    const missing = await routes["/csrf/submit"]!.POST!(request("/csrf/submit", { method: "POST", headers: { Cookie: cookie } }), server);
    expect(missing.status).toBe(419);

    const query = await routes["/csrf/submit"]!.POST!(request(`/csrf/submit?_token=${token}`, { method: "POST", headers: { Cookie: cookie } }), server);
    expect(query.status).toBe(419);

    const json = await routes["/csrf/submit"]!.POST!(request("/csrf/submit", {
      method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ _token: token }),
    }), server);
    expect(json.status).toBe(419);

    const header = await routes["/csrf/submit"]!.POST!(request("/csrf/submit", {
      method: "POST", headers: { Cookie: cookie, "X-CSRF-TOKEN": token },
    }), server);
    expect(await header.json()).toEqual({ count: 1 });
    const refreshed = header.headers.get("set-cookie")!.split(";", 1)[0]!;

    const form = new URLSearchParams({ _token: token });
    const submitted = await routes["/csrf/submit"]!.POST!(request("/csrf/submit", {
      method: "POST", body: form, headers: { Cookie: refreshed },
    }), server);
    expect(await submitted.json()).toEqual({ count: 2 });
    await app.stop();
  });
});
