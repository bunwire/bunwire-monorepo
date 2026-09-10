import {
  Event, Listener, Provider, EventDispatcher, createToken, defineApp,
  defineEventDefinition, defineListenerDefinition, defineRuntimeRegistry,
  type Application, type Container, type EventDefinition, type InvocationContext,
  type ProviderLifecycle,
} from "@bunwire/core";
import {
  BunAdapter, MemoryQueueDriver, BUN_EXECUTION_SCOPE_MANAGER, BUN_HTTP_CONTEXT,
  type BunRuntimeRole, type BunHttpContext,
} from "@bunwire/bun";
import { afterEach, describe, expect, it, vi } from "vitest";

const applications: Application[] = [];
afterEach(async () => { await Promise.all(applications.splice(0).map((app) => app.stop())); });

async function start(
  events: readonly EventDefinition[],
  providers: readonly (new () => ProviderLifecycle)[] = [],
  role: BunRuntimeRole = "command",
) {
  const listeners = events.flatMap((event) => event.listeners);
  const app = defineApp().withAdapter(new BunAdapter({ role, handleSignals: false, ...(role === "worker" ? { queues: { driver: new MemoryQueueDriver() } } : {}) }))
    .withProviders(...providers)
    .withRuntimeRegistry(defineRuntimeRegistry({
      classes: [...events, ...listeners], methods: listeners.map((entry) => entry.handle), events,
    }));
  applications.push(app);
  await app.start();
  return app;
}

describe("Bun Milestone 10 — Core dispatcher runtime contract", () => {
  it.each(["worker", "scheduler", "command"] as const)("dispatches the exact event instance in the %s role without HTTP", async (role) => {
    const received: object[] = [];
    @Event()
    class Payload { constructor(readonly id: string) {} }
    @Listener(Payload)
    class Observer { handle(event: Payload): void { received.push(event); } }
    const app = await start([defineEventDefinition({ target: Payload, listeners: [
      defineListenerDefinition({ target: Observer, event: Payload }),
    ] })], [], role);
    const payload = new Payload(role);
    await app.rootContainer.get(EventDispatcher).dispatch(payload);
    expect(received).toEqual([payload]);
    expect(received[0]).toBe(payload);
    expect(app.rootContainer.has(BUN_HTTP_CONTEXT)).toBe(false);
  });

  it("awaits source-ordered listeners and boots Providers once per dispatch", async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let boots = 0;
    @Provider()
    class BootProvider { register(): void {} boot(): void { boots += 1; } }
    @Event()
    class Ordered {}
    @Listener(Ordered)
    class First {
      async handle(_event: Ordered): Promise<void> { order.push("first:start"); await gate; order.push("first:end"); }
    }
    @Listener(Ordered)
    class Second { handle(_event: Ordered): void { order.push("second"); } }
    const app = await start([defineEventDefinition({ target: Ordered, listeners: [First, Second].map((target) => (
      defineListenerDefinition({ target, event: Ordered })
    )) })], [BootProvider]);
    const pending = app.rootContainer.get(EventDispatcher).dispatch(new Ordered());
    await vi.waitFor(() => expect(order).toEqual(["first:start"]));
    expect(boots).toBe(1);
    release();
    await pending;
    expect(order).toEqual(["first:start", "first:end", "second"]);
    expect(boots).toBe(1);
  });

  it("propagates the original listener failure, skips later listeners, and accepts zero listeners", async () => {
    const original = new Error("listener rejected");
    const skipped = vi.fn();
    @Event()
    class Failed {}
    @Event()
    class Empty {}
    @Listener(Failed)
    class Failing { async handle(_event: Failed): Promise<never> { throw original; } }
    @Listener(Failed)
    class Later { handle(_event: Failed): void { skipped(); } }
    const app = await start([
      defineEventDefinition({ target: Failed, listeners: [Failing, Later].map((target) => defineListenerDefinition({ target, event: Failed })) }),
      defineEventDefinition({ target: Empty }),
    ]);
    const dispatcher = app.rootContainer.get(EventDispatcher);
    await expect(dispatcher.dispatch(new Failed())).rejects.toBe(original);
    expect(skipped).not.toHaveBeenCalled();
    await expect(dispatcher.dispatch(new Empty())).resolves.toBeUndefined();
    await app.stop();
    await expect(dispatcher.dispatch(new Empty())).rejects.toThrow(/running/i);
  });

  it("isolates concurrent and nested invocation bindings without inheriting request state", async () => {
    const REQUEST_ONLY = createToken<string>("request-only");
    const LOCAL = createToken<{ context: InvocationContext; touches: string[] }>("event-local");
    type Local = { context: InvocationContext; touches: string[] };
    const observed: { id: string; local: Local; listener: object }[] = [];
    const boots: InvocationContext[] = [];
    @Event()
    class ScopedEvent {
      constructor(readonly id: string, readonly gate: Promise<void> = Promise.resolve(), readonly nested = false) {}
    }
    @Listener(ScopedEvent)
    class ScopedListener {
      constructor(private readonly local: Local, private readonly events: EventDispatcher) {}
      async handle(event: ScopedEvent): Promise<void> {
        this.local.touches.push("first");
        observed.push({ id: event.id, local: this.local, listener: this });
        await event.gate;
        if (event.nested) await this.events.dispatch(new ScopedEvent(`${event.id}:nested`));
      }
    }
    @Listener(ScopedEvent)
    class PeerListener {
      constructor(private readonly local: Local) {}
      handle(_event: ScopedEvent): void { this.local.touches.push("second"); }
    }
    @Provider()
    class ScopeProvider {
      register(): void {}
      boot(context: InvocationContext): void {
        boots.push(context);
        context.container.value(LOCAL, { context, touches: [] });
        context.container.singleton(ScopedListener).singleton(PeerListener);
      }
    }
    const app = await start([defineEventDefinition({ target: ScopedEvent, listeners: [
      defineListenerDefinition({ target: ScopedListener, event: ScopedEvent, dependencies: [{ index: 0, token: LOCAL }, { index: 1, token: EventDispatcher }] }),
      defineListenerDefinition({ target: PeerListener, event: ScopedEvent, dependencies: [{ index: 0, token: LOCAL }] }),
    ] })], [ScopeProvider]);
    const manager = app.rootContainer.get(BUN_EXECUTION_SCOPE_MANAGER);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const run = (id: string, delay: Promise<void>, nested: boolean) => manager.run("http-request", async (scope) => {
      scope.value(REQUEST_ONLY, id);
      scope.value(BUN_HTTP_CONTEXT, { request: new Request(`http://example.test/${id}`), scope } as BunHttpContext);
      await scope.resolve(EventDispatcher).dispatch(new ScopedEvent(id, delay, nested));
    });
    const first = run("one", gate, true);
    await vi.waitFor(() => expect(observed).toHaveLength(1));
    await run("two", Promise.resolve(), false);
    expect(observed[0]!.local.touches).toEqual(["first"]);
    expect(observed[1]!.local.touches).toEqual(["first", "second"]);
    release();
    await first;
    expect(observed.map((entry) => entry.id)).toEqual(["one", "two", "one:nested"]);
    expect(new Set(observed.map((entry) => entry.local)).size).toBe(3);
    expect(new Set(observed.map((entry) => entry.listener)).size).toBe(3);
    expect(new Set(boots.map((context) => context.id)).size).toBe(3);
    for (const { local } of observed) {
      expect(local.touches).toEqual(["first", "second"]);
      expect(local.context.container.parent).toBe(app.rootContainer);
      expect(local.context.container.has(REQUEST_ONLY)).toBe(false);
      expect(local.context.container.has(BUN_HTTP_CONTEXT)).toBe(false);
    }
    expect(app.rootContainer.has(LOCAL)).toBe(false);
    expect(manager.activeScopeCount).toBe(0);
  });

  it("preserves an application-owned recording dispatcher installed by a Provider", async () => {
    const records: object[] = [];
    const listener = vi.fn();
    class RecordingDispatcher extends EventDispatcher {
      override async dispatch(event: object): Promise<void> { records.push(event); }
    }
    const fake = new RecordingDispatcher();
    @Provider()
    class FakeProvider { register(container: Container): void { container.instance(EventDispatcher, fake); } }
    @Event()
    class Recorded {}
    @Listener(Recorded)
    class RealListener { handle(_event: Recorded): void { listener(); } }
    const app = await start([defineEventDefinition({ target: Recorded, listeners: [
      defineListenerDefinition({ target: RealListener, event: Recorded }),
    ] })], [FakeProvider]);
    expect(app.rootContainer.get(EventDispatcher)).toBe(fake);
    const scope = app.rootContainer.get(BUN_EXECUTION_SCOPE_MANAGER).create("http-request");
    const event = new Recorded();
    await scope.resolve(EventDispatcher).dispatch(event);
    expect(records[0]).toBe(event);
    expect(listener).not.toHaveBeenCalled();
    await scope.dispose();
  });
});
