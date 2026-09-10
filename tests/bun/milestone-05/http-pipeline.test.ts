import {
  BUN_HTTP_ROUTE_KIND,
  BunAdapter,
  BunAdapterError,
  BunAuthorizationException,
  BunCsrfMismatchException,
  BunHttpException,
  BunMethodNotAllowedException,
  BunNotFoundException,
  BunRedirectResult,
  BunUnauthenticatedException,
  BunUnsupportedResponseError,
  BunValidationException,
  Get,
  redirect,
  type BunHttpExceptionContext,
  type BunHttpExceptionHandler,
  type BunHttpResponseResolver,
  type BunHttpServerOptions,
} from "@bunwire/bun";
import {
  CONTROLLER_KIND,
  Controller,
  Middleware,
  defineApp,
  defineManagedMethodPlan,
  defineMiddlewareAttachment,
  defineMiddlewareDefinition,
  defineRuntimeRegistry,
} from "@bunwire/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let resultValue: unknown;
let failureValue: unknown;
const unwind: string[] = [];

@Middleware()
class FinallyMiddleware {
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> {
    try {
      return await next();
    } finally {
      unwind.push("finally");
    }
  }
}

@Controller("/pipeline")
class PipelineController {
  @Get("/result")
  result(): unknown { return resultValue; }

  @Get("/failure")
  failure(): never { throw failureValue; }
}

const resultPlan = defineManagedMethodPlan({
  kind: BUN_HTTP_ROUTE_KIND,
  ownerKind: CONTROLLER_KIND,
  target: PipelineController,
  method: "result",
  data: { method: "GET", path: "/result" },
  parameters: [],
});

const failurePlan = defineManagedMethodPlan({
  kind: BUN_HTTP_ROUTE_KIND,
  ownerKind: CONTROLLER_KIND,
  target: PipelineController,
  method: "failure",
  data: { method: "GET", path: "/failure" },
  parameters: [],
  middleware: [defineMiddlewareAttachment(FinallyMiddleware)],
});

const registry = defineRuntimeRegistry({
  classes: [
    { kind: CONTROLLER_KIND, target: PipelineController, data: { prefix: "/pipeline" } },
    defineMiddlewareDefinition({ target: FinallyMiddleware }),
  ],
  methods: [resultPlan, failurePlan],
});

type Handler = (request: Request, server: object) => Response | Promise<Response>;

interface FakeServeOptions {
  readonly routes: Record<string, Record<string, Handler>>;
  readonly fetch: Handler;
  readonly error: (error: Error) => Response | Promise<Response>;
}

let previousBun: PropertyDescriptor | undefined;
let options: FakeServeOptions;
let server: { stop: ReturnType<typeof vi.fn> };

beforeEach(() => {
  previousBun = Object.getOwnPropertyDescriptor(globalThis, "Bun");
  server = { stop: vi.fn().mockResolvedValue(undefined) };
  Object.defineProperty(globalThis, "Bun", {
    configurable: true,
    value: {
      serve: vi.fn((received: FakeServeOptions) => {
        options = received;
        return server;
      }),
    },
  });
  resultValue = undefined;
  failureValue = new Error("expected failure");
  unwind.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  if (previousBun) Object.defineProperty(globalThis, "Bun", previousBun);
  else Reflect.deleteProperty(globalThis, "Bun");
});

function request(path: string, method = "GET"): Request {
  return Object.assign(new Request(`http://local${path}`, { method }), { params: {} });
}

async function start(http: BunHttpServerOptions = {}) {
  const app = defineApp()
    .withAdapter(new BunAdapter({ handleSignals: false, http }))
    .withRuntimeRegistry(registry);
  await app.start();
  return app;
}

function resultHandler(): Handler {
  return options.routes["/pipeline/result"]!.GET!;
}

function failureHandler(): Handler {
  return options.routes["/pipeline/failure"]!.GET!;
}

describe("Bun Milestone 5 — HTTP response and exception pipeline", () => {
  it("validates and freezes redirect and HTTP exception contracts", () => {
    expect(redirect("/next")).toEqual({ location: "/next", status: 302 });
    expect(redirect("/next", 307)).toBeInstanceOf(BunRedirectResult);
    expect(Object.isFrozen(redirect("/next"))).toBe(true);
    expect(() => redirect("")).toThrow(/location/i);
    expect(() => redirect("/next", 304 as never)).toThrow(/status/i);
    expect(() => new BunHttpException(399)).toThrow(/between 400 and 599/i);
    expect(new BunNotFoundException().status).toBe(404);
    expect(new BunMethodNotAllowedException(["GET"]).headers).toEqual([["allow", "GET"]]);
    expect(new BunUnauthenticatedException().status).toBe(401);
    expect(new BunAuthorizationException().status).toBe(403);
    expect(new BunCsrfMismatchException().status).toBe(419);
    const validation = new BunValidationException({ email: ["Required"] });
    expect(validation.status).toBe(422);
    expect(Object.isFrozen(validation.errors.email)).toBe(true);
  });

  it("validates adapter pipeline options deterministically", () => {
    expect(() => new BunAdapter({ http: { mode: "test" as never } })).toThrow(BunAdapterError);
    expect(() => new BunAdapter({ http: { responseResolvers: {} as never } })).toThrow(/responseResolvers/i);
    expect(() => new BunAdapter({ http: { responseResolvers: [{} as never] } })).toThrow(/resolver/i);
    expect(() => new BunAdapter({ http: { exceptionHandler: {} as never } })).toThrow(/exceptionHandler/i);
  });

  it("passes native responses through and normalizes void and every JSON value", async () => {
    const app = await start();
    const native = new Response("native", { status: 201 });
    resultValue = native;
    await expect(resultHandler()(request("/pipeline/result"), server)).resolves.toBe(native);

    resultValue = undefined;
    const empty = await resultHandler()(request("/pipeline/result"), server);
    expect(empty.status).toBe(204);
    expect(await empty.text()).toBe("");

    for (const value of [null, true, "text", 42, [1, "two"], { ok: true }]) {
      resultValue = value;
      const response = await resultHandler()(request("/pipeline/result"), server);
      expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
      await expect(response.json()).resolves.toEqual(value);
    }
    await app.stop();
  });

  it("resolves redirects and ordered application response resolvers", async () => {
    class CustomResult { constructor(readonly value: string) {} }
    const calls: string[] = [];
    const first: BunHttpResponseResolver = {
      resolve(value) { calls.push("first"); return value instanceof CustomResult ? undefined : undefined; },
    };
    const second: BunHttpResponseResolver = {
      resolve(value, context) {
        calls.push(`second:${context.scope.state}`);
        return value instanceof CustomResult ? new Response(value.value, { status: 202 }) : undefined;
      },
    };
    const app = await start({ responseResolvers: [first, second] });

    resultValue = redirect("/destination", 303);
    const redirected = await resultHandler()(request("/pipeline/result"), server);
    expect(redirected.status).toBe(303);
    expect(redirected.headers.get("location")).toBe("/destination");
    expect(calls).toEqual([]);

    resultValue = new CustomResult("resolved");
    const custom = await resultHandler()(request("/pipeline/result"), server);
    expect(custom.status).toBe(202);
    expect(await custom.text()).toBe("resolved");
    expect(calls).toEqual(["first", "second:active"]);
    await app.stop();

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = await start({
      responseResolvers: [{ resolve() { throw new Error("resolver failed"); } }],
    });
    resultValue = new CustomResult("unresolved");
    const failed = await resultHandler()(request("/pipeline/result"), server);
    expect(failed.status).toBe(500);
    expect(await failed.text()).toBe("Internal Server Error");
    await failing.stop();
  });

  it("rejects unsupported values deterministically and renders a safe production 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = await start();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const value of [new Date(), 1n, Number.NaN, Number.POSITIVE_INFINITY, [, 1], cyclic, { missing: undefined }]) {
      resultValue = value;
      const response = await resultHandler()(request("/pipeline/result"), server);
      expect(response.status).toBe(500);
      expect(await response.text()).toBe("Internal Server Error");
    }
    expect(console.error).toHaveBeenCalledWith(
      "Unhandled Bunwire HTTP request error.",
      expect.any(BunUnsupportedResponseError),
    );
    await app.stop();
  });

  it("renders known exceptions, centralized 404/405, and validation failures", async () => {
    const app = await start();
    const cases: readonly [unknown, number, string][] = [
      [new BunHttpException(418, "Teapot", { headers: { "X-Test": "known" } }), 418, "Teapot"],
      [new BunNotFoundException(), 404, "Not Found"],
      [new BunUnauthenticatedException(), 401, "Unauthenticated"],
      [new BunAuthorizationException(), 403, "Forbidden"],
      [new BunCsrfMismatchException(), 419, "CSRF Token Mismatch"],
    ];
    for (const [error, status, body] of cases) {
      failureValue = error;
      const response = await failureHandler()(request("/pipeline/failure"), server);
      expect(response.status).toBe(status);
      expect(await response.text()).toBe(body);
      if (status === 418) expect(response.headers.get("x-test")).toBe("known");
    }

    failureValue = new BunValidationException({ email: ["Required"] });
    const validation = await failureHandler()(request("/pipeline/failure"), server);
    expect(validation.status).toBe(422);
    await expect(validation.json()).resolves.toEqual({
      message: "Validation Failed",
      errors: { email: ["Required"] },
    });

    const notAllowed = await options.routes["/pipeline/result"]!.POST!(
      request("/pipeline/result", "POST"),
      server,
    );
    expect(notAllowed.status).toBe(405);
    expect(notAllowed.headers.get("allow")).toBe("GET");
    const missing = await options.fetch(request("/missing"), server);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("Not Found");
    expect(unwind).toHaveLength(cases.length + 1);
    await app.stop();
  });

  it("keeps unexpected production output safe and limits details to explicit development mode", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const production = await start({ mode: "production" });
    failureValue = new Error("private details");
    const safe = await failureHandler()(request("/pipeline/failure"), server);
    expect(await safe.text()).toBe("Internal Server Error");
    await production.stop();

    const development = await start({ mode: "development" });
    failureValue = new Error("visible details");
    const detailed = await failureHandler()(request("/pipeline/failure"), server);
    expect(await detailed.text()).toContain("visible details");
    await development.stop();
  });

  it("supports a replacement handler and isolates reporting/rendering failures", async () => {
    const contexts: BunHttpExceptionContext[] = [];
    const handler: BunHttpExceptionHandler = {
      report(_error, context) { contexts.push(context); throw new Error("report failed"); },
      render(_error, context) {
        return new Response(context.http ? `custom:${context.http.scope.state}` : "custom:fallback", {
          status: 499,
        });
      },
    };
    const app = await start({ exceptionHandler: handler });
    failureValue = new Error("handled");
    const managed = await failureHandler()(request("/pipeline/failure"), server);
    expect(managed.status).toBe(499);
    expect(await managed.text()).toBe("custom:active");
    expect(Object.isFrozen(contexts[0])).toBe(true);

    const fallback = await options.fetch(request("/missing"), server);
    expect(fallback.status).toBe(499);
    expect(await fallback.text()).toBe("custom:fallback");
    await app.stop();

    let renderCalls = 0;
    const broken = await start({
      exceptionHandler: {
        report() {},
        render() {
          renderCalls += 1;
          if (renderCalls === 1) return "invalid" as never;
          throw new Error("render failed");
        },
      },
    });
    failureValue = new Error("original");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const safe = await failureHandler()(request("/pipeline/failure"), server);
      expect(safe.status).toBe(500);
      expect(await safe.text()).toBe("Internal Server Error");
    }
    const nativeBoundary = await options.error(new Error("native"));
    expect(nativeBoundary.status).toBe(500);
    expect(await nativeBoundary.text()).toBe("Internal Server Error");
    await broken.stop();
  });
});
