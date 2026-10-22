import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUN_COMPILER_DESCRIPTOR, BUN_HTTP_ROUTE_KIND, BunAdapter, Get, ThrottleMiddleware,
  type BunHttpContext, type BunHttpServerOptions,
} from "@bunwire/bun";
import {
  CONTROLLER_KIND, MIDDLEWARE_KIND, Controller, defineApp,
  defineManagedMethodPlan, defineMiddlewareAttachment, defineRuntimeRegistry,
} from "@bunwire/core";

let hits = 0;

@Controller("/limits")
class LimitController {
  @Get("/api") api() { hits++; return { ok: true }; }
  @Get("/other") other() { hits++; return { ok: true }; }
}

const registry = defineRuntimeRegistry({
  classes: [
    { kind: CONTROLLER_KIND, target: LimitController, data: { prefix: "/limits" } },
    { kind: MIDDLEWARE_KIND, target: ThrottleMiddleware, data: Object.freeze({ scope: "transient", alias: "throttle" }), scope: "transient" },
  ],
  methods: [
    defineManagedMethodPlan({ kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND, target: LimitController,
      method: "api", data: { method: "GET", path: "/api" }, parameters: [],
      middleware: [defineMiddlewareAttachment(ThrottleMiddleware, ["api"])] }),
    defineManagedMethodPlan({ kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND, target: LimitController,
      method: "other", data: { method: "GET", path: "/other" }, parameters: [],
      middleware: [defineMiddlewareAttachment(ThrottleMiddleware, ["other"])] }),
  ],
});

type Handler = (request: Request, server: object) => Promise<Response>;
interface FakeServeOptions { readonly routes: Record<string, Record<string, Handler>> }
let previousBun: PropertyDescriptor | undefined;
let options: FakeServeOptions;
const server = { stop: vi.fn().mockResolvedValue(undefined) };

beforeEach(() => {
  hits = 0;
  previousBun = Object.getOwnPropertyDescriptor(globalThis, "Bun");
  Object.defineProperty(globalThis, "Bun", { configurable: true, value: {
    serve(received: FakeServeOptions) { options = received; return server; },
  } });
});
afterEach(() => {
  if (previousBun) Object.defineProperty(globalThis, "Bun", previousBun);
  else Reflect.deleteProperty(globalThis, "Bun");
});

function http(): BunHttpServerOptions<{ id: string }> {
  return {
    auth: { defaultGuard: "bearer", guards: [{ name: "bearer", authenticate: ({ http }) => {
      const authorization = http.request.headers.get("authorization");
      return authorization?.startsWith("Bearer ") ? { id: authorization.slice(7) } : undefined;
    } }] },
    rateLimiting: { policies: [
      { name: "api", limit: 2, windowMs: 60_000, onBackendError: "closed",
        key: (context: BunHttpContext<{ id: string }>) => context.auth?.principal ? `user:${context.auth.principal.id}` : `guest:${context.request.headers.get("x-client-id") ?? "shared"}` },
      { name: "other", limit: 1, windowMs: 60_000, onBackendError: "open", key: () => "shared" },
    ] },
  };
}

async function start(configuration = http(), runtimeRegistry = registry) {
  const app = defineApp().withAdapter(new BunAdapter({ handleSignals: false, http: configuration }))
    .withRuntimeRegistry(runtimeRegistry);
  await app.start();
  return app;
}

function send(path: "/limits/api" | "/limits/other", headers: HeadersInit = {}) {
  return options.routes[path]!.GET!(new Request(`http://localhost${path}`, { headers }), server);
}

describe("Bun Milestone 20 — generated route integration", () => {
  it("registers the built-in compiler alias and enforces request-aware identities", async () => {
    expect(BUN_COMPILER_DESCRIPTOR.middlewareDefinitions?.some((definition) => definition.data.alias === "throttle"
      && definition.compilerSymbol.exportName === "ThrottleMiddleware")).toBe(true);
    const app = await start();
    try {
      expect((await send("/limits/api", { Authorization: "Bearer alice" })).status).toBe(200);
      expect((await send("/limits/api", { Authorization: "Bearer alice" })).status).toBe(200);
      const blocked = await send("/limits/api", { Authorization: "Bearer alice" });
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
      expect(blocked.headers.get("Cache-Control")).toBe("no-store");
      expect((await send("/limits/api", { Authorization: "Bearer bob" })).status).toBe(200);
      expect((await send("/limits/api", { "x-client-id": "anon-1" })).status).toBe(200);
      expect((await send("/limits/api", { "x-client-id": "anon-2" })).status).toBe(200);
      expect((await send("/limits/other")).status).toBe(200);
      expect((await send("/limits/other")).status).toBe(429);
      expect(hits).toBe(6);
    } finally { await app.stop(); }
  });

  it("rejects unknown and missing policies at startup", async () => {
    const invalid = defineRuntimeRegistry({ classes: registry.classes, methods: [
      defineManagedMethodPlan({ kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND, target: LimitController,
        method: "api", data: { method: "GET", path: "/api" }, parameters: [],
        middleware: [defineMiddlewareAttachment(ThrottleMiddleware, ["missing"])] }),
    ] });
    await expect(start(http(), invalid)).rejects.toThrow(/configured policy name/);
    const { rateLimiting: _rateLimiting, ...withoutRateLimiting } = http();
    await expect(start(withoutRateLimiting)).rejects.toThrow(/requires configured Bun rate limiting/);
  });
});
