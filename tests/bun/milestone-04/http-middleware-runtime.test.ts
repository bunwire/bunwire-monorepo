import {
  BUN_EXECUTION_SCOPE,
  BUN_HTTP_CONTEXT_RESOLVER_ID,
  BUN_HTTP_ROUTE_KIND,
  BunAdapter,
  Context,
  Get,
  Post,
  type BunHttpContext,
  type BunMiddlewareContext,
} from "@bunwire/bun";
import {
  CONTROLLER_KIND,
  Controller,
  Inject,
  Middleware,
  Provider,
  createToken,
  defineApp,
  defineManagedMethodPlan,
  defineMiddlewareAttachment,
  defineMiddlewareDefinition,
  defineRuntimeRegistry,
  type Container,
  type InvocationContext,
} from "@bunwire/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface InvocationValue { readonly id: number }
const INVOCATION_VALUE = createToken<InvocationValue>("bun.m4.invocation-value");
const events: string[] = [];
const contexts: BunMiddlewareContext[] = [];
let controllerRuns = 0;
let observerInstances = 0;
let skippedInstances = 0;
let providerRegistrations = 0;

@Provider()
class RequestProvider {
  register(_container: Container): void { providerRegistrations += 1; }
  boot(context: InvocationContext): void {
    context.container.value(INVOCATION_VALUE, { id: context.id });
    events.push(`boot:${context.id}`);
  }
}

@Middleware()
class ObserverMiddleware {
  readonly instance = ++observerInstances;
  constructor(@Inject(INVOCATION_VALUE) readonly invocation: InvocationValue) {}

  async handle(context: BunMiddlewareContext, next: () => Promise<unknown>): Promise<unknown> {
    contexts.push(context);
    events.push(`observer:${context.parameters[0]}:before:${this.invocation.id}:${this.instance}`);
    const result = await next();
    events.push(`observer:${context.parameters[0]}:after:${this.invocation.id}:${this.instance}`);
    return result;
  }
}

@Middleware()
class PostOnlyMiddleware {
  async handle(context: BunMiddlewareContext, next: () => Promise<unknown>): Promise<unknown> {
    events.push(`post:${context.method}`);
    return next();
  }
}

@Middleware()
class MatchingPathMiddleware {
  async handle(context: BunMiddlewareContext, next: () => Promise<unknown>): Promise<unknown> {
    events.push(`path:${context.path}`);
    return next();
  }
}

@Middleware()
class SkippedMiddleware {
  constructor() { skippedInstances += 1; }
  handle(_context: BunMiddlewareContext, next: () => Promise<unknown>): Promise<unknown> {
    return next();
  }
}

@Middleware()
class ShortCircuitMiddleware {
  handle(context: BunMiddlewareContext): Response {
    events.push(`short:${context.parameters[0]}`);
    return new Response(`short:${context.parameters[0]}`, { status: 202 });
  }
}

@Controller("/api")
class MiddlewareController {
  @Get("/users/:id")
  get(
    @Context() context: BunHttpContext,
    @Inject(INVOCATION_VALUE) invocation: InvocationValue,
  ): Response {
    controllerRuns += 1;
    events.push(`controller:${context.route.params.id}:${invocation.id}`);
    return new Response(`get:${context.route.params.id}`);
  }

  @Post("/users/:id")
  post(@Context() context: BunHttpContext): Response {
    controllerRuns += 1;
    return new Response(`post:${context.route.params.id}`);
  }

  @Get("/short")
  short(): Response {
    controllerRuns += 1;
    return new Response("controller");
  }
}

const observerDefinition = defineMiddlewareDefinition({
  target: ObserverMiddleware,
  dependencies: [{ index: 0, token: INVOCATION_VALUE }],
});
const postDefinition = defineMiddlewareDefinition({
  target: PostOnlyMiddleware,
  data: { only: ["POST"] },
});
const pathDefinition = defineMiddlewareDefinition({
  target: MatchingPathMiddleware,
  data: { include: ["/api/users/*"], exclude: ["/api/users/blocked"] },
});
const skippedDefinition = defineMiddlewareDefinition({
  target: SkippedMiddleware,
  data: { include: ["/other/**"] },
});
const shortDefinition = defineMiddlewareDefinition({ target: ShortCircuitMiddleware });

function routePlan(
  methodName: "get" | "post" | "short",
  method: "GET" | "POST",
  path: string,
  middleware: readonly ReturnType<typeof defineMiddlewareAttachment>[],
  context = false,
) {
  return defineManagedMethodPlan({
    kind: BUN_HTTP_ROUTE_KIND,
    ownerKind: CONTROLLER_KIND,
    target: MiddlewareController,
    method: methodName,
    data: { method, path },
    parameters: context
      ? [
          { source: "resolver" as const, methodIndex: 0, resolverId: BUN_HTTP_CONTEXT_RESOLVER_ID },
          ...(methodName === "get"
            ? [{ source: "container" as const, methodIndex: 1, token: INVOCATION_VALUE }]
            : []),
        ]
      : [],
    middleware,
  });
}

const getPlan = routePlan("get", "GET", "/users/:id", [
  defineMiddlewareAttachment(ObserverMiddleware, ["outer"]),
  defineMiddlewareAttachment(ObserverMiddleware, ["inner"]),
  defineMiddlewareAttachment(PostOnlyMiddleware),
  defineMiddlewareAttachment(MatchingPathMiddleware),
  defineMiddlewareAttachment(SkippedMiddleware),
], true);
const postPlan = routePlan("post", "POST", "/users/:id", [
  defineMiddlewareAttachment(PostOnlyMiddleware),
  defineMiddlewareAttachment(MatchingPathMiddleware),
], true);
const shortPlan = routePlan("short", "GET", "/short", [
  defineMiddlewareAttachment(ShortCircuitMiddleware, ["policy"]),
]);

function registry(
  definitions = [observerDefinition, postDefinition, pathDefinition, skippedDefinition, shortDefinition],
  methods = [getPlan, postPlan, shortPlan],
) {
  return defineRuntimeRegistry({
    classes: [
      { kind: CONTROLLER_KIND, target: MiddlewareController, data: { prefix: "/api" } },
      ...definitions,
    ],
    methods,
  });
}

interface FakeServeOptions {
  readonly routes: Record<string, Record<string, (request: Request, server: object) => Response | Promise<Response>>>;
}

let previousBun: PropertyDescriptor | undefined;
let options: FakeServeOptions;
const server = { stop: vi.fn().mockResolvedValue(undefined) };

beforeEach(() => {
  events.length = 0;
  contexts.length = 0;
  controllerRuns = 0;
  observerInstances = 0;
  skippedInstances = 0;
  providerRegistrations = 0;
  previousBun = Object.getOwnPropertyDescriptor(globalThis, "Bun");
  Object.defineProperty(globalThis, "Bun", {
    configurable: true,
    value: { serve: vi.fn((received: FakeServeOptions) => { options = received; return server; }) },
  });
});

afterEach(() => {
  if (previousBun) Object.defineProperty(globalThis, "Bun", previousBun);
  else Reflect.deleteProperty(globalThis, "Bun");
});

function request(url: string, method: string, params: Record<string, string> = {}): Request {
  return Object.assign(new Request(url, { method }), { params });
}

describe("Bun Milestone 4 — HTTP middleware runtime", () => {
  it("runs transient DI middleware before/after the Controller in one isolated invocation", async () => {
    const app = defineApp()
      .withAdapter(new BunAdapter({ handleSignals: false }))
      .withProviders(RequestProvider)
      .withRuntimeRegistry(registry());
    await app.start();

    const handler = options.routes["/api/users/:id"]!.GET!;
    const response = await handler(
      request("http://local/api/users/42?ignored=true", "GET", { id: "42" }),
      server,
    );
    expect(await response.text()).toBe("get:42");
    expect(observerInstances).toBe(2);
    expect(skippedInstances).toBe(0);
    expect(controllerRuns).toBe(1);
    expect(events.filter((entry) => !entry.startsWith("boot"))).toEqual([
      expect.stringMatching(/^observer:outer:before:\d+:1$/),
      expect.stringMatching(/^observer:inner:before:\d+:2$/),
      "path:/api/users/42",
      expect.stringMatching(/^controller:42:\d+$/),
      expect.stringMatching(/^observer:inner:after:\d+:2$/),
      expect.stringMatching(/^observer:outer:after:\d+:1$/),
    ]);
    const ids = events.flatMap((entry) => {
      if (entry.startsWith("boot:")) return [entry.split(":")[1]!];
      if (entry.startsWith("observer:")) return [entry.split(":")[3]!];
      return [];
    });
    expect(new Set(ids).size).toBe(1);
    expect(contexts.map(({ parameters }) => parameters)).toEqual([["outer"], ["inner"]]);
    for (const context of contexts) {
      expect(context).toMatchObject({
        path: "/api/users/42",
        method: "GET",
        transport: "http",
      });
      expect(context.request.url).toBe("http://local/api/users/42?ignored=true");
      expect(context.route.path).toBe("/api/users/:id");
      expect(context.scope.container.get(BUN_EXECUTION_SCOPE)).toBe(context.scope);
      expect(Object.isFrozen(context)).toBe(true);
      expect(Object.isFrozen(context.parameters)).toBe(true);
    }
    await app.stop();
  });

  it("filters by actual pathname and uppercase method without constructing skipped middleware", async () => {
    const app = defineApp()
      .withAdapter(new BunAdapter({ handleSignals: false }))
      .withProviders(RequestProvider)
      .withRuntimeRegistry(registry());
    await app.start();

    const get = options.routes["/api/users/:id"]!.GET!;
    const blocked = await get(
      request("http://local/api/users/blocked", "GET", { id: "blocked" }),
      server,
    );
    expect(await blocked.text()).toBe("get:blocked");
    expect(events.some((entry) => entry.startsWith("path:"))).toBe(false);
    expect(events.some((entry) => entry.startsWith("post:"))).toBe(false);
    expect(skippedInstances).toBe(0);

    events.length = 0;
    const post = options.routes["/api/users/:id"]!.POST!;
    const accepted = await post(
      request("http://local/api/users/42", "POST", { id: "42" }),
      server,
    );
    expect(await accepted.text()).toBe("post:42");
    expect(events.filter((entry) => !entry.startsWith("boot:"))).toEqual([
      "post:POST",
      "path:/api/users/42",
    ]);
    await app.stop();
  });

  it("supports native Response short-circuiting without invoking the Controller", async () => {
    const app = defineApp()
      .withAdapter(new BunAdapter({ handleSignals: false }))
      .withRuntimeRegistry(registry());
    await app.start();
    const response = await options.routes["/api/short"]!.GET!(
      request("http://local/api/short", "GET"),
      server,
    );
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("short:policy");
    expect(controllerRuns).toBe(0);
    expect(events).toEqual(["short:policy"]);
    await app.stop();
  });

  it("keeps middleware request and invocation state isolated across concurrent requests", async () => {
    const app = defineApp()
      .withAdapter(new BunAdapter({ handleSignals: false }))
      .withProviders(RequestProvider)
      .withRuntimeRegistry(registry());
    await app.start();
    const handler = options.routes["/api/users/:id"]!.GET!;
    const [first, second] = await Promise.all([
      handler(request("http://local/api/users/one", "GET", { id: "one" }), server),
      handler(request("http://local/api/users/two", "GET", { id: "two" }), server),
    ]);
    expect(await first.text()).toBe("get:one");
    expect(await second.text()).toBe("get:two");
    const firstContexts = contexts.filter(({ path }) => path.endsWith("/one"));
    const secondContexts = contexts.filter(({ path }) => path.endsWith("/two"));
    expect(firstContexts).toHaveLength(2);
    expect(secondContexts).toHaveLength(2);
    expect(new Set(firstContexts.map(({ scope }) => scope.id)).size).toBe(1);
    expect(new Set(secondContexts.map(({ scope }) => scope.id)).size).toBe(1);
    expect(firstContexts[0]!.scope.id).not.toBe(secondContexts[0]!.scope.id);
    await app.stop();
  });

  it.each([
    [{ only: ["get"] }, /unsupported HTTP method.*get/i],
    [{ except: ["http"] }, /unsupported HTTP method.*http/i],
    [{ include: ["/"] }, /at least one path segment/i],
    [{ include: ["api\\**"] }, /must use '\/' separators/i],
    [{ include: ["api/a**b"] }, /complete path segment/i],
    [{ exclude: ["../api"] }, /may not traverse/i],
    [{ include: ["/api?query=true"] }, /query or fragment/i],
  ])("rejects malformed filters before Provider registration: %j", async (data, message) => {
    @Middleware()
    class InvalidMiddleware {
      handle(_context: BunMiddlewareContext, next: () => Promise<unknown>): Promise<unknown> {
        return next();
      }
    }
    const invalidDefinition = defineMiddlewareDefinition({ target: InvalidMiddleware, data });
    const invalidPlan = routePlan("short", "GET", "/short", [
      defineMiddlewareAttachment(InvalidMiddleware),
    ]);
    const app = defineApp()
      .withAdapter(new BunAdapter({ handleSignals: false }))
      .withProviders(RequestProvider)
      .withRuntimeRegistry(registry([invalidDefinition], [invalidPlan]));
    await expect(app.start()).rejects.toThrow(message);
    expect(providerRegistrations).toBe(0);
  });

  it("rejects generated attachments without a middleware definition before Provider registration", async () => {
    const app = defineApp()
      .withAdapter(new BunAdapter({ handleSignals: false }))
      .withProviders(RequestProvider)
      .withRuntimeRegistry(registry([], [shortPlan]));
    await expect(app.start()).rejects.toThrow(/without a runtime middleware definition/i);
    expect(providerRegistrations).toBe(0);
  });
});
