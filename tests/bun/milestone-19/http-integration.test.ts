import {
  BUN_HTTP_ROUTE_KIND,
  BUN_MAINTENANCE,
  BUN_WEBSOCKET_KIND,
  BUN_WEBSOCKET_MESSAGE_KIND,
  BunAdapter,
  Get,
  MemoryQueueDriver,
  WebSocket as SocketDecorator,
  type BunHttpServerOptions,
} from "@bunwire/bun";
import {
  CONTROLLER_KIND,
  Controller,
  Provider,
  defineApp,
  defineManagedMethodPlan,
  defineRuntimeRegistry,
} from "@bunwire/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let calls = 0;
let providerRegistrations = 0;

@Provider()
class OperationalProvider {
  register(): void { providerRegistrations++; }
}

@Controller("/operations")
class OperationsController {
  @Get("/ok")
  ok(): Response { calls++; return new Response("ok"); }
}

@SocketDecorator("/chat")
class ChatSocket {
  message(_client: unknown, _message: string): void {}
}

function registry(socket = false) {
  return defineRuntimeRegistry({
    classes: [
      { kind: CONTROLLER_KIND, target: OperationsController, data: { prefix: "/operations" } },
      ...(socket ? [{ kind: BUN_WEBSOCKET_KIND, target: ChatSocket, data: { path: "/chat" }, scope: "transient" as const, dependencies: [] }] : []),
    ],
    methods: [
      defineManagedMethodPlan({ kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND,
        target: OperationsController, method: "ok", data: { method: "GET", path: "/ok" }, parameters: [] }),
      ...(socket ? [defineManagedMethodPlan({ kind: BUN_WEBSOCKET_MESSAGE_KIND, ownerKind: BUN_WEBSOCKET_KIND,
        target: ChatSocket, method: "message", data: undefined, parameters: [
          { source: "transport", methodIndex: 0, argumentIndex: 0, optional: false, rest: false },
          { source: "transport", methodIndex: 1, argumentIndex: 1, optional: false, rest: false },
        ] })] : []),
    ],
  });
}

type Handler = (request: Request, server: object) => Response | undefined | Promise<Response | undefined>;
interface FakeServeOptions {
  readonly routes: Record<string, Record<string, Handler>>;
  readonly fetch: Handler;
}

let previousBun: PropertyDescriptor | undefined;
let native: FakeServeOptions;
let serve: ReturnType<typeof vi.fn>;
let stop: ReturnType<typeof vi.fn>;
let upgrade: ReturnType<typeof vi.fn>;
let server: { stop: typeof stop; upgrade: typeof upgrade };

beforeEach(() => {
  calls = 0;
  providerRegistrations = 0;
  previousBun = Object.getOwnPropertyDescriptor(globalThis, "Bun");
  stop = vi.fn().mockResolvedValue(undefined);
  upgrade = vi.fn().mockReturnValue(false);
  server = { stop, upgrade };
  serve = vi.fn((received: FakeServeOptions) => { native = received; return server; });
  Object.defineProperty(globalThis, "Bun", { configurable: true, value: { serve } });
});

afterEach(() => {
  if (previousBun) Object.defineProperty(globalThis, "Bun", previousBun);
  else Reflect.deleteProperty(globalThis, "Bun");
});

function invoke(path: string, method = "GET", headers?: HeadersInit): Promise<Response> {
  const request = new Request(`http://local${path}`, { method, ...(headers ? { headers } : {}) });
  const route = native.routes[new URL(request.url).pathname]?.[method];
  return Promise.resolve((route ?? native.fetch)(request, server)).then((response) => response!);
}

async function start(http: BunHttpServerOptions, socket = false, provider = false) {
  const app = defineApp().withAdapter(new BunAdapter({ handleSignals: false, http })).withRuntimeRegistry(registry(socket));
  if (provider) app.withProviders(OperationalProvider);
  await app.start();
  return app;
}

describe("Bun Milestone 19 — native HTTP integration", () => {
  it("exposes minimal health endpoints through the existing server and never starts Providers again", async () => {
    const check = vi.fn(async () => true);
    let startupReady = -1;
    let startupLive = -1;
    const app = await start({ health: { checks: { database: check } }, async onServer() {
      startupLive = (await invoke("/health/live")).status;
      startupReady = (await invoke("/health/ready")).status;
    } }, false, true);
    try {
      expect(serve).toHaveBeenCalledTimes(1);
      expect(startupLive).toBe(200);
      expect(startupReady).toBe(503);
      expect(check).not.toHaveBeenCalled();
      const live = await invoke("/health/live");
      const ready = await invoke("/health/ready");
      expect(live.status).toBe(200);
      expect(await live.json()).toEqual({ status: "ok" });
      expect(ready.status).toBe(200);
      expect(check).toHaveBeenCalledTimes(1);
      expect(providerRegistrations).toBe(1);
      expect((await invoke("/health/ready", "HEAD")).status).toBe(200);
      expect(await (await invoke("/health/live", "HEAD")).text()).toBe("");
      expect((await invoke("/health/ready", "POST")).status).toBe(405);
      expect((await invoke("/health/ready", "POST")).headers.get("Allow")).toBe("GET, HEAD");
    } finally { await app.stop(); }
  });

  it("blocks routes, fallback assets, and WebSocket upgrades while allowing explicit bypass", async () => {
    const authorize = vi.fn(async (request: Request) => request.headers.get("X-Operator-Key") === "configured-secret");
    const app = await start({ health: {}, maintenance: { authorizeBypass: authorize, retryAfterSeconds: 30 } }, true);
    try {
      const maintenance = app.rootContainer.get(BUN_MAINTENANCE);
      expect((await invoke("/operations/ok")).status).toBe(200);
      maintenance.enable();
      const blocked = await invoke("/operations/ok");
      expect(blocked.status).toBe(503);
      expect(blocked.headers.get("Retry-After")).toBe("30");
      expect(await blocked.json()).toEqual({ status: "unavailable" });
      expect((await invoke("/missing.png")).status).toBe(503);
      expect((await invoke("/chat", "GET", { Upgrade: "websocket" })).status).toBe(503);
      expect(upgrade).not.toHaveBeenCalled();
      expect((await invoke("/health/live")).status).toBe(200);
      expect((await invoke("/health/ready")).status).toBe(503);
      expect((await invoke("/operations/ok", "GET", { "X-Operator-Key": "wrong" })).status).toBe(503);
      expect((await invoke("/operations/ok", "GET", { "X-Operator-Key": "configured-secret" })).status).toBe(200);
      expect(calls).toBe(2);
      maintenance.disable();
      expect((await invoke("/operations/ok")).status).toBe(200);
    } finally { await app.stop(); }
  });

  it("changes readiness before server shutdown finishes", async () => {
    let release!: () => void;
    const stopping = new Promise<void>((resolve) => { release = resolve; });
    stop.mockReturnValue(stopping);
    const app = await start({ health: {} });
    expect((await invoke("/health/ready")).status).toBe(200);
    const closing = app.stop();
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(app.state).toBe("stopping");
    expect((await invoke("/health/ready")).status).toBe(503);
    expect((await invoke("/health/live")).status).toBe(200);
    release();
    await closing;
    expect((await invoke("/health/live")).status).toBe(503);
  });

  it("uses configured health paths without adding a second server", async () => {
    const app = await start({ health: { livenessPath: "/ops/live", readinessPath: "/ops/ready" } });
    try {
      expect(serve).toHaveBeenCalledOnce();
      expect((await invoke("/ops/live")).status).toBe(200);
      expect((await invoke("/ops/ready")).status).toBe(200);
      expect((await invoke("/health/live")).status).toBe(404);
    } finally { await app.stop(); }
  });

  it("rejects path collisions and keeps other roles HTTP-free", async () => {
    const collision = defineApp().withAdapter(new BunAdapter({ handleSignals: false,
      http: { health: { livenessPath: "/operations/ok" } } })).withRuntimeRegistry(registry());
    await expect(collision.start()).rejects.toThrow(/health path.*conflicts/i);
    expect(serve).not.toHaveBeenCalled();
    @Controller("/health") class DynamicHealthController {
      @Get("/:name") name(): string { return "managed"; }
    }
    const dynamic = defineApp().withAdapter(new BunAdapter({ handleSignals: false, http: { health: {} } }))
      .withRuntimeRegistry(defineRuntimeRegistry({
        classes: [{ kind: CONTROLLER_KIND, target: DynamicHealthController, data: { prefix: "/health" } }],
        methods: [defineManagedMethodPlan({ kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND,
          target: DynamicHealthController, method: "name", data: { method: "GET", path: "/:name" }, parameters: [] })],
      }));
    await expect(dynamic.start()).rejects.toThrow(/health path.*conflicts/i);
    expect(serve).not.toHaveBeenCalled();
    expect(() => new BunAdapter({ role: "worker", http: { health: {} } })).toThrow(/only.*http or command/i);
    expect(() => new BunAdapter({ role: "scheduler", http: { maintenance: {} } })).toThrow(/only.*http or command/i);
    const command = defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false,
      http: { health: {}, maintenance: {} } })).withRuntimeRegistry(defineRuntimeRegistry());
    await command.start();
    expect(serve).not.toHaveBeenCalled();
    await command.stop();
    const worker = defineApp().withAdapter(new BunAdapter({ role: "worker", handleSignals: false,
      queues: { driver: new MemoryQueueDriver() } })).withRuntimeRegistry(defineRuntimeRegistry());
    await worker.start();
    expect(serve).not.toHaveBeenCalled();
    await worker.stop();
    const scheduler = defineApp().withAdapter(new BunAdapter({ role: "scheduler", handleSignals: false }))
      .withRuntimeRegistry(defineRuntimeRegistry());
    await scheduler.start();
    expect(serve).not.toHaveBeenCalled();
    await scheduler.stop();
  });
});
