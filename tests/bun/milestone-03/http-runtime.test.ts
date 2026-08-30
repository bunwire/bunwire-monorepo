import {
  BUN_HTTP_CONTEXT_RESOLVER_ID,
  BUN_HTTP_ROUTE_KIND,
  BunAdapter,
  BunAdapterError,
  Context,
  Get,
  Post,
  type BunHttpContext,
} from "@bunwire/bun";
import {
  CONTROLLER_KIND,
  Controller,
  SERVICE_KIND,
  Service,
  createToken,
  defineApp,
  defineManagedMethodPlan,
  defineRuntimeRegistry,
} from "@bunwire/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REQUEST_MARKER = createToken<{ readonly scopeId: number }>("test.http.request-marker");

@Service()
class HttpService {
  readonly value = "injected";
}

@Controller("/api/")
class HttpController {
  constructor(readonly service: HttpService) {}

  @Get("/users/:id")
  details(@Context() context: BunHttpContext): Response {
    context.scope.scoped(REQUEST_MARKER, () => ({ scopeId: context.scope.id }));
    const marker = context.scope.resolve(REQUEST_MARKER);
    return Response.json({
      service: this.service.value,
      method: context.route.method,
      path: context.route.path,
      param: context.route.params.id,
      url: context.request.url,
      scopeId: context.scope.id,
      markerScopeId: marker.scopeId,
      frozen: Object.isFrozen(context) && Object.isFrozen(context.route.params),
    });
  }

  @Post("/users")
  created(): Response { return new Response("created", { status: 201 }); }
  @Get("/unsupported")
  unsupported(): string { return "not a response"; }
  @Get("/failure")
  failure(): Response { throw new Error("route failure"); }
  @Get("/:id")
  first(): Response { return new Response(); }
  @Get("/:name")
  second(): Response { return new Response(); }
}

function routePlan(
  methodName: keyof HttpController,
  method: "GET" | "POST",
  path: string,
  context = false,
) {
  return defineManagedMethodPlan({
    kind: BUN_HTTP_ROUTE_KIND,
    ownerKind: CONTROLLER_KIND,
    target: HttpController,
    method: methodName,
    data: { method, path },
    parameters: context
      ? [{ source: "resolver" as const, methodIndex: 0, resolverId: BUN_HTTP_CONTEXT_RESOLVER_ID }]
      : [],
  });
}

function registry(methods = [
  routePlan("details", "GET", "/users/:id", true),
  routePlan("created", "POST", "/users"),
  routePlan("unsupported", "GET", "/unsupported"),
  routePlan("failure", "GET", "/failure"),
]) {
  return defineRuntimeRegistry({
    classes: [
      { kind: SERVICE_KIND, target: HttpService, data: { scope: "singleton" } },
      {
        kind: CONTROLLER_KIND,
        target: HttpController,
        data: { prefix: "/api/" },
        dependencies: [{ index: 0, token: HttpService }],
      },
    ],
    methods,
  });
}

interface FakeServeOptions {
  readonly hostname?: string;
  readonly port?: number;
  readonly routes: Record<string, Record<string, (request: Request, server: object) => Response | Promise<Response>>>;
  readonly fetch: (request: Request, server: object) => Response | Promise<Response>;
}

let previousBun: PropertyDescriptor | undefined;
let serve: ReturnType<typeof vi.fn>;
let stop: ReturnType<typeof vi.fn>;
let options: FakeServeOptions;
let server: { readonly native: true; stop: ReturnType<typeof vi.fn> };

beforeEach(() => {
  previousBun = Object.getOwnPropertyDescriptor(globalThis, "Bun");
  stop = vi.fn().mockResolvedValue(undefined);
  server = { native: true, stop };
  serve = vi.fn((received: FakeServeOptions) => {
    options = received;
    return server;
  });
  Object.defineProperty(globalThis, "Bun", {
    configurable: true,
    value: { serve },
  });
});

afterEach(() => {
  if (previousBun) Object.defineProperty(globalThis, "Bun", previousBun);
  else Reflect.deleteProperty(globalThis, "Bun");
});

function request(url: string, params: Record<string, string> = {}): Request {
  return Object.assign(new Request(url), { params });
}

describe("Bun Milestone 3 — native HTTP runtime", () => {
  it("validates native HTTP options and role ownership", () => {
    expect(() => new BunAdapter({ role: "worker", http: {} })).toThrow(BunAdapterError);
    expect(() => new BunAdapter({ http: null as never })).toThrow(/http options must be an object/i);
    expect(() => new BunAdapter({ http: { hostname: "" } })).toThrow(/hostname/i);
    expect(() => new BunAdapter({ http: { port: -1 } })).toThrow(/port/i);
    expect(() => new BunAdapter({ http: { port: 65_536 } })).toThrow(/port/i);
    expect(() => new BunAdapter({ http: { onServer: true as never } })).toThrow(/onServer/i);
  });

  it("starts one grouped native server and exposes the exact server callback", async () => {
    const onServer = vi.fn();
    const app = defineApp()
      .withAdapter(new BunAdapter({
        handleSignals: false,
        http: { hostname: "127.0.0.1", port: 0, onServer },
      }))
      .withRuntimeRegistry(registry());

    await app.start();
    expect(serve).toHaveBeenCalledTimes(1);
    expect(options.hostname).toBe("127.0.0.1");
    expect(options.port).toBe(0);
    expect(Object.keys(options.routes).sort()).toEqual([
      "/api/failure",
      "/api/unsupported",
      "/api/users",
      "/api/users/:id",
    ]);
    expect(onServer).toHaveBeenCalledWith(server);
    await app.stop();
    expect(stop).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledWith(false);
  });

  it("invokes controllers through request scopes and returns deterministic responses", async () => {
    const app = defineApp()
      .withAdapter(new BunAdapter({ handleSignals: false }))
      .withRuntimeRegistry(registry());
    await app.start();

    const get = options.routes["/api/users/:id"]?.GET;
    expect(get).toBeTypeOf("function");
    const [first, second] = await Promise.all([
      get!(request("http://local/api/users/one", { id: "one" }), server),
      get!(request("http://local/api/users/two", { id: "two" }), server),
    ]);
    const firstBody = await first.json() as Record<string, unknown>;
    const secondBody = await second.json() as Record<string, unknown>;
    expect(firstBody).toMatchObject({
      service: "injected",
      method: "GET",
      path: "/api/users/:id",
      param: "one",
      url: "http://local/api/users/one",
      frozen: true,
    });
    expect(firstBody.markerScopeId).toBe(firstBody.scopeId);
    expect(secondBody.scopeId).not.toBe(firstBody.scopeId);

    const created = await options.routes["/api/users"]!.POST!(request("http://local/api/users"), server);
    expect(created.status).toBe(201);
    expect(await created.text()).toBe("created");

    const notAllowed = await options.routes["/api/users"]!.GET!(request("http://local/api/users"), server);
    expect(notAllowed.status).toBe(405);
    expect(notAllowed.headers.get("Allow")).toBe("POST");
    expect(await notAllowed.text()).toBe("Method Not Allowed");

    const missing = await options.fetch(request("http://local/missing"), server);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("Not Found");

    for (const path of ["/api/unsupported", "/api/failure"]) {
      const response = await options.routes[path]!.GET!(request(`http://local${path}`), server);
      expect(response.status).toBe(500);
      expect(await response.text()).toBe("Internal Server Error");
    }
    await app.stop();
  });

  it("rejects malformed or conflicting generated registry routes", async () => {
    const foreignPlan = defineManagedMethodPlan({
      kind: BUN_HTTP_ROUTE_KIND,
      ownerKind: CONTROLLER_KIND,
      target: HttpController,
      method: "created",
      data: { method: "TRACE", path: "/trace" } as never,
      parameters: [],
    });
    const malformed = defineApp()
      .withAdapter(new BunAdapter({ handleSignals: false }))
      .withRuntimeRegistry(registry([foreignPlan]));
    await expect(malformed.start()).rejects.toThrow(/managed-method metadata|malformed or unsupported/i);

    const first = routePlan("first", "GET", "/:id");
    const second = routePlan("second", "GET", "/:name");
    const duplicate = defineApp()
      .withAdapter(new BunAdapter({ handleSignals: false }))
      .withRuntimeRegistry(registry([first, second]));
    await expect(duplicate.start()).rejects.toThrow(/duplicate Bun HTTP route/i);
  });

  it("attempts scope cleanup when native server cleanup fails", async () => {
    const serverFailure = new Error("server stop failed");
    stop.mockRejectedValue(serverFailure);
    const app = defineApp()
      .withAdapter(new BunAdapter({ handleSignals: false }))
      .withRuntimeRegistry(registry());
    await app.start();
    await expect(app.stop()).rejects.toBe(serverFailure);
    expect(stop).toHaveBeenCalledWith(false);
    expect(app.state).toBe("failed");
  });
});
