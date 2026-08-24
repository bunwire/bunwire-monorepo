import { beforeEach, describe, expect, it, vi } from "vitest";
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
  getManagedMethodMetadata,
  type Container,
  type InvocationContext,
} from "@bunwire/core";
import {
  ELECTROBUN_CONTEXT,
  ELECTROBUN_CONTEXT_RESOLVER_ID,
  ELECTROBUN_MESSAGE_KIND,
  ELECTROBUN_ROUTE_KIND,
  ElectrobunAdapter,
  ManualElectrobunAdapter,
  Message,
  Route,
  defineElectrobunContext,
  type ElectrobunContext,
  type ElectrobunMiddlewareContext,
  type ElectrobunRPC,
  type ElectrobunWindow,
} from "@bunwire/electrobun";
import { BrowserView, BrowserWindow, type FakeElectrobunRPC } from "../fixtures/milestone-11-electrobun/fake-native.js";

interface ScopeValue { readonly invocationId: number }
const SCOPE = createToken<ScopeValue>("milestone-12e.scope");
const events: string[] = [];
const contexts: ElectrobunMiddlewareContext[] = [];
let observerInstances = 0;
let skippedInstances = 0;
let controllerRuns = 0;
let startupProviderRegistrations = 0;

@Provider()
class StartupObservationProvider {
  register(_container: Container): void { startupProviderRegistrations += 1; }
}

@Provider()
class ScopeProvider {
  register(_container: Container): void {}
  boot(context: InvocationContext): void {
    events.push(`boot:${context.id}`);
    context.container.value(SCOPE, { invocationId: context.id });
  }
}

@Middleware()
class ObserverMiddleware {
  readonly instance = ++observerInstances;
  constructor(@Inject(SCOPE) readonly scope: ScopeValue) {}

  async handle(context: ElectrobunMiddlewareContext, next: () => Promise<unknown>): Promise<unknown> {
    contexts.push(context);
    events.push(`observer:${context.parameters[0]}:before:${this.scope.invocationId}:${this.instance}`);
    const result = await next();
    events.push(`observer:${context.parameters[0]}:after:${this.scope.invocationId}:${this.instance}`);
    return `${context.parameters[0]}(${String(result)})`;
  }
}

@Middleware()
class RequestOnlyMiddleware {
  async handle(context: ElectrobunMiddlewareContext, next: () => Promise<unknown>): Promise<unknown> {
    events.push(`request-only:${context.transport}`);
    return next();
  }
}

@Middleware()
class MessageOnlyMiddleware {
  async handle(context: ElectrobunMiddlewareContext, next: () => Promise<unknown>): Promise<unknown> {
    events.push(`message-only:${context.transport}`);
    return next();
  }
}

@Middleware()
class SkippedMiddleware {
  constructor() { skippedInstances += 1; }
  async handle(_context: ElectrobunMiddlewareContext, next: () => Promise<unknown>): Promise<unknown> {
    return next();
  }
}

@Middleware()
class ShortCircuitMiddleware {
  async handle(context: ElectrobunMiddlewareContext): Promise<unknown> {
    events.push(`short:${context.parameters[0]}`);
    return `short:${context.parameters[0]}`;
  }
}

@Middleware()
class FailureMiddleware {
  async handle(context: ElectrobunMiddlewareContext): Promise<never> {
    throw new Error(`middleware-failure:${context.transport}`);
  }
}

@Controller("api")
class MiddlewareController {
  @Route("users/run")
  run(value: string, @Inject(SCOPE) scope: ScopeValue, context: ElectrobunContext): string {
    controllerRuns += 1;
    events.push(`controller:${scope.invocationId}:${context.window.title}`);
    return value;
  }

  @Route("short")
  short(): string {
    controllerRuns += 1;
    return "controller-short";
  }

  @Route("failure")
  failure(): string { return "unreachable"; }

  @Route("controller-failure")
  controllerFailure(): never { throw new Error("controller-failure:request"); }

  @Message("event")
  message(value: string): string {
    events.push(`message:${value}`);
    return "ignored-message-result";
  }

  @Message("failure")
  messageFailure(): never { throw new Error("controller-failure:message"); }
}

const observerDefinition = defineMiddlewareDefinition({
  target: ObserverMiddleware,
  data: { include: ["/api/**/run/"], only: ["request"] },
  dependencies: [{ index: 0, token: SCOPE }],
});
const requestOnlyDefinition = defineMiddlewareDefinition({
  target: RequestOnlyMiddleware,
  data: { include: ["api/*/run"], except: ["message"] },
});
const messageOnlyDefinition = defineMiddlewareDefinition({
  target: MessageOnlyMiddleware,
  data: { only: ["message"] },
});
const skippedDefinition = defineMiddlewareDefinition({
  target: SkippedMiddleware,
  data: { include: ["api/**"], exclude: ["api/users/**"] },
});
const shortDefinition = defineMiddlewareDefinition({ target: ShortCircuitMiddleware });
const failureDefinition = defineMiddlewareDefinition({ target: FailureMiddleware });

const requestPlan = defineManagedMethodPlan({
  kind: ELECTROBUN_ROUTE_KIND,
  ownerKind: CONTROLLER_KIND,
  target: MiddlewareController,
  method: "run",
  data: { path: "users/run" },
  parameters: [
    { source: "transport", methodIndex: 0, argumentIndex: 0, optional: false },
    { source: "container", methodIndex: 1, token: SCOPE },
    { source: "resolver", methodIndex: 2, resolverId: ELECTROBUN_CONTEXT_RESOLVER_ID },
  ],
  middleware: [
    defineMiddlewareAttachment(ObserverMiddleware, ["outer"]),
    defineMiddlewareAttachment(ObserverMiddleware, ["inner"]),
    defineMiddlewareAttachment(RequestOnlyMiddleware),
    defineMiddlewareAttachment(MessageOnlyMiddleware),
    defineMiddlewareAttachment(SkippedMiddleware),
  ],
});
const shortPlan = defineManagedMethodPlan({
  kind: ELECTROBUN_ROUTE_KIND,
  ownerKind: CONTROLLER_KIND,
  target: MiddlewareController,
  method: "short",
  data: { path: "short" },
  parameters: [],
  middleware: [defineMiddlewareAttachment(ShortCircuitMiddleware, ["policy"])],
});
const failurePlan = defineManagedMethodPlan({
  kind: ELECTROBUN_ROUTE_KIND,
  ownerKind: CONTROLLER_KIND,
  target: MiddlewareController,
  method: "failure",
  data: { path: "failure" },
  parameters: [],
  middleware: [defineMiddlewareAttachment(FailureMiddleware)],
});
const controllerFailurePlan = defineManagedMethodPlan({
  kind: ELECTROBUN_ROUTE_KIND,
  ownerKind: CONTROLLER_KIND,
  target: MiddlewareController,
  method: "controllerFailure",
  data: { path: "controller-failure" },
  parameters: [],
});
const messagePlan = defineManagedMethodPlan({
  kind: ELECTROBUN_MESSAGE_KIND,
  ownerKind: CONTROLLER_KIND,
  target: MiddlewareController,
  method: "message",
  data: { path: "event" },
  parameters: [{ source: "transport", methodIndex: 0, argumentIndex: 0, optional: false }],
  middleware: [
    defineMiddlewareAttachment(RequestOnlyMiddleware),
    defineMiddlewareAttachment(MessageOnlyMiddleware),
  ],
});
const messageFailurePlan = defineManagedMethodPlan({
  kind: ELECTROBUN_MESSAGE_KIND,
  ownerKind: CONTROLLER_KIND,
  target: MiddlewareController,
  method: "messageFailure",
  data: { path: "failure" },
  parameters: [],
  middleware: [],
});

function registry(definitions = [
  observerDefinition,
  requestOnlyDefinition,
  messageOnlyDefinition,
  skippedDefinition,
  shortDefinition,
  failureDefinition,
]) {
  return defineRuntimeRegistry({
    classes: [
      { kind: CONTROLLER_KIND, target: MiddlewareController, data: { prefix: "api" } },
      ...definitions,
    ],
    methods: [requestPlan, shortPlan, failurePlan, controllerFailurePlan, messagePlan, messageFailurePlan],
  });
}

function fakeRpc(rpc: ElectrobunRPC): FakeElectrobunRPC {
  return rpc as unknown as FakeElectrobunRPC;
}

function manualContext(title = "Manual"): ElectrobunContext {
  const rpc = BrowserView.defineRPC({ handlers: { requests: {}, messages: {} } });
  return defineElectrobunContext(new BrowserWindow({ title, rpc }) as unknown as ElectrobunWindow);
}

async function turn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  events.length = 0;
  contexts.length = 0;
  observerInstances = 0;
  skippedInstances = 0;
  controllerRuns = 0;
  startupProviderRegistrations = 0;
  BrowserWindow.instances.length = 0;
});

describe.sequential("Middleware Redesign 12E — Electrobun managed middleware", () => {
  it("preserves generated-plan validation metadata under Bun standard decorators", () => {
    const metadata = {};
    class StandardController {
      run(): string { return "standard"; }
    }
    (Route("standard") as unknown as (
      value: typeof StandardController.prototype.run,
      context: object,
    ) => unknown)(StandardController.prototype.run, { kind: "method", name: "run", metadata });
    (Controller("standard") as unknown as (
      value: typeof StandardController,
      context: object,
    ) => unknown)(StandardController, { kind: "class", name: "StandardController", metadata });
    expect(getManagedMethodMetadata(StandardController.prototype, "run")?.kind)
      .toBe(ELECTROBUN_ROUTE_KIND);
  });

  it("runs selected transient middleware in one scope with exact immutable context", async () => {
    const app = defineApp()
      .withAdapter(new ElectrobunAdapter({ mainWindow: { title: "Normal", hidden: true } }))
      .withProviders(ScopeProvider)
      .withRuntimeRegistry(registry());
    await app.start();
    const native = app.rootContainer.get(ELECTROBUN_CONTEXT);

    await expect(fakeRpc(native.rpc).receiveRequest("api/users/run", { args: ["value"] }))
      .resolves.toBe("outer(inner(value))");
    expect(observerInstances).toBe(2);
    expect(skippedInstances).toBe(0);
    expect(controllerRuns).toBe(1);
    const invocationIds = events.flatMap((event) => event.match(/:(\d+)(?::|$)/)?.[1] ?? []);
    expect(new Set(invocationIds).size).toBe(1);
    expect(events.filter((event) => !event.startsWith("boot"))).toEqual([
      expect.stringMatching(/^observer:outer:before:\d+:1$/),
      expect.stringMatching(/^observer:inner:before:\d+:2$/),
      "request-only:request",
      expect.stringMatching(/^controller:\d+:Normal$/),
      expect.stringMatching(/^observer:inner:after:\d+:2$/),
      expect.stringMatching(/^observer:outer:after:\d+:1$/),
    ]);
    expect(contexts.map(({ parameters }) => parameters)).toEqual([["outer"], ["inner"]]);
    for (const context of contexts) {
      expect(context).toMatchObject({ endpoint: "api/users/run", transport: "request", args: ["value"] });
      expect(context.window).toBe(native.window);
      expect(context.webview).toBe(native.webview);
      expect(context.rpc).toBe(native.rpc);
      expect(Object.isFrozen(context)).toBe(true);
      expect(Object.isFrozen(context.args)).toBe(true);
      expect(Object.isFrozen(context.parameters)).toBe(true);
    }
  });

  it("short-circuits requests, propagates request failures, and ignores message results", async () => {
    const errors: Array<{ error: unknown; endpoint: string; payload: unknown }> = [];
    const app = defineApp()
      .withAdapter(new ElectrobunAdapter({
        mainWindow: { hidden: true },
        rpc: { onMessageError: (error, context) => { errors.push({ error, ...context }); } },
      }))
      .withProviders(ScopeProvider)
      .withRuntimeRegistry(registry());
    await app.start();
    const rpc = fakeRpc(app.rootContainer.get(ELECTROBUN_CONTEXT).rpc);

    await expect(rpc.receiveRequest("api/short", { args: [] })).resolves.toBe("short:policy");
    expect(controllerRuns).toBe(0);
    await expect(rpc.receiveRequest("api/failure", { args: [] }))
      .rejects.toThrow("middleware-failure:request");
    await expect(rpc.receiveRequest("api/controller-failure", { args: [] }))
      .rejects.toThrow("controller-failure:request");
    expect(rpc.receiveMessage("api/event", { args: ["payload"] })).toBeUndefined();
    await turn();
    expect(events).toContain("message-only:message");
    expect(events).toContain("message:payload");
    expect(events).not.toContain("request-only:message");

    const payload = { args: [] };
    expect(rpc.receiveMessage("api/failure", payload)).toBeUndefined();
    await turn();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.error).toEqual(new Error("controller-failure:message"));
    expect(errors[0]).toMatchObject({ endpoint: "api/failure", payload });
  });

  it("runs the same registry in manual mode without replacing native APIs", async () => {
    const context = manualContext("Existing");
    const nativeMessages: Array<{ method: string; payload: unknown }> = [];
    context.rpc.addMessageListener("*", (method, payload) => nativeMessages.push({ method, payload }));
    const fallback = vi.fn((method: string) => `native:${method}`);
    const app = defineApp()
      .withAdapter(new ManualElectrobunAdapter({ fallbackRequestHandler: fallback }))
      .withProviders(ScopeProvider)
      .withRuntimeRegistry(registry())
      .withContext(context);
    await app.start();
    await expect(fakeRpc(context.rpc).receiveRequest("api/users/run", { args: ["manual"] }))
      .resolves.toBe("outer(inner(manual))");
    expect(fakeRpc(context.rpc).receiveRequest("native/request", { untouched: true }))
      .toBe("native:native/request");
    fakeRpc(context.rpc).receiveMessage("native/event", { untouched: true });
    expect(nativeMessages).toContainEqual({ method: "native/event", payload: { untouched: true } });
    context.rpc.send("native/outgoing", { ok: true });
    await context.rpc.request("native/query", { id: 1 });
    expect(fakeRpc(context.rpc).outgoingMessages).toContainEqual({ method: "native/outgoing", payload: { ok: true } });
    expect(fakeRpc(context.rpc).outgoingRequests).toContainEqual({ method: "native/query", payload: { id: 1 } });
  });

  it("uses fallback logging when messages or onMessageError callbacks fail", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = defineApp()
      .withAdapter(new ElectrobunAdapter({ mainWindow: { hidden: true } }))
      .withProviders(ScopeProvider)
      .withRuntimeRegistry(registry());
    await app.start();
    fakeRpc(app.rootContainer.get(ELECTROBUN_CONTEXT).rpc).receiveMessage("api/failure", { args: [] });
    await turn();
    expect(logged).toHaveBeenCalledWith(
      'Bunwire Electrobun message endpoint "api/failure" failed.',
      expect.objectContaining({ message: "controller-failure:message" }),
    );

    const callbackFailure = defineApp()
      .withAdapter(new ElectrobunAdapter({
        mainWindow: { hidden: true },
        rpc: { onMessageError: () => { throw new Error("callback-failure"); } },
      }))
      .withProviders(ScopeProvider)
      .withRuntimeRegistry(registry());
    await callbackFailure.start();
    fakeRpc(callbackFailure.rootContainer.get(ELECTROBUN_CONTEXT).rpc)
      .receiveMessage("api/failure", { args: [] });
    await turn();
    expect(logged).toHaveBeenCalledWith(
      'Bunwire Electrobun onMessageError callback failed for "api/failure".',
      expect.objectContaining({ message: "callback-failure" }),
    );
    logged.mockRestore();
  });

  it.each([
    [{ only: ["REQUEST"] }, /unsupported transport.*REQUEST/i],
    [{ except: ["event"] }, /unsupported transport.*event/i],
    [{ include: ["/"] }, /at least one path segment/i],
    [{ include: ["api\\**"] }, /must use '\/' separators/i],
    [{ include: ["api/a**b"] }, /complete path segment/i],
    [{ exclude: ["../api"] }, /may not traverse/i],
  ])("rejects malformed Electrobun filter metadata before traffic: %j", async (data, message) => {
    @Middleware()
    class InvalidMiddleware {
      async handle(_context: ElectrobunMiddlewareContext, next: () => Promise<unknown>): Promise<unknown> {
        return next();
      }
    }
    const definition = defineMiddlewareDefinition({ target: InvalidMiddleware, data });
    const invalidPlan = defineManagedMethodPlan({
      kind: ELECTROBUN_ROUTE_KIND,
      ownerKind: CONTROLLER_KIND,
      target: MiddlewareController,
      method: "short",
      data: { path: "invalid" },
      parameters: [],
      middleware: [defineMiddlewareAttachment(InvalidMiddleware)],
    });
    const invalidRegistry = defineRuntimeRegistry({
      classes: [
        { kind: CONTROLLER_KIND, target: MiddlewareController, data: { prefix: "api" } },
        definition,
      ],
      methods: [invalidPlan],
    });
    await expect(defineApp()
      .withAdapter(new ElectrobunAdapter({ mainWindow: { hidden: true } }))
      .withProviders(StartupObservationProvider)
      .withRuntimeRegistry(invalidRegistry)
      .start()).rejects.toThrow(message);
    expect(startupProviderRegistrations).toBe(0);
  });

  it("rejects managed attachments without registry definitions before traffic", async () => {
    const missing = defineRuntimeRegistry({
      classes: [{ kind: CONTROLLER_KIND, target: MiddlewareController, data: { prefix: "api" } }],
      methods: [shortPlan],
    });
    await expect(defineApp()
      .withAdapter(new ElectrobunAdapter({ mainWindow: { hidden: true } }))
      .withProviders(StartupObservationProvider)
      .withRuntimeRegistry(missing)
      .start()).rejects.toThrow(/without a runtime middleware definition/i);
    expect(startupProviderRegistrations).toBe(0);
  });
});
