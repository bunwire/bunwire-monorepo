import { afterEach, describe, expect, it, vi } from "vitest";
import { Event, Listener, EventDispatcher, Provider, createToken, defineApp, defineRuntimeRegistry, defineEventDefinition, defineListenerDefinition, getManagedClassAttachments,
  type Application, type ConstructorDependencyMetadata, type ListenerConstructor, type Container, type InvocationContext } from "@bunwire/core";
import { BunAdapter, Queue, defineQueueEventCodec, MemoryQueueDriver, SyncQueueDriver, BUN_JOB_CONTEXT, BUN_QUEUE_MANAGER, BUN_EXECUTION_SCOPE_MANAGER,
  type BunJobContext, type QueueEventCodec, type QueueDriver } from "@bunwire/bun";

const apps: Application[] = [];
afterEach(async () => { await Promise.allSettled(apps.splice(0).map((app) => app.stop())); });
@Event() class Payload { readonly #id: string; note = "initial"; constructor(id: string) { this.#id = id; } get id(): string { return this.#id; } }
const codec = defineQueueEventCodec({ id: "payload", version: 1, event: Payload,
  encode: (event) => ({ id: event.id, note: event.note }),
  decode: (data) => { if (typeof data.id !== "string") throw new Error("invalid id"); const event = new Payload(data.id); event.note = data.note; return event; },
});
function registry(targets: readonly ListenerConstructor<Payload>[], dependencies: ReadonlyMap<Function, readonly ConstructorDependencyMetadata[]> = new Map()) {
  const listeners = targets.map((target) => defineListenerDefinition({ target, event: Payload, dependencies: dependencies.get(target) ?? [] }));
  const event = defineEventDefinition({ target: Payload, listeners });
  return defineRuntimeRegistry({ classes: [event, ...listeners], events: [event], methods: listeners.map((listener) => listener.handle),
    classAttachments: targets.flatMap((target) => [...getManagedClassAttachments(target)]) });
}
async function start(targets: readonly ListenerConstructor<Payload>[], options: {
  driver?: QueueDriver; codecs?: readonly QueueEventCodec<any, any>[]; worker?: boolean;
  dependencies?: ReadonlyMap<Function, readonly ConstructorDependencyMetadata[]>; providers?: readonly (new () => { register(container: Container): void })[];
} = {}) {
  const driver = options.driver ?? new SyncQueueDriver();
  const app = defineApp().withAdapter(new BunAdapter({ role: options.worker ? "worker" : "command", handleSignals: false,
    queues: { driver, eventCodecs: options.codecs ?? [codec], ...(options.worker ? { worker: { pollIntervalMs: 5, leaseDurationMs: 3000 } } : {}) } }))
    .withProviders(...options.providers ?? []).withRuntimeRegistry(registry(targets, options.dependencies));
  apps.push(app); await app.start(); return { app, driver, dispatcher: app.rootContainer.get(EventDispatcher), manager: app.rootContainer.get(BUN_QUEUE_MANAGER) };
}

describe("queued Core listeners", () => {
  it("retries the selected listener with fresh DI and disposal, without inheriting caller bindings", async () => {
    const caller = createToken<string>("listener.caller"); const invocation = createToken<string>("listener.invocation");
    const resource = createToken<object>("listener.resource"); const order: string[] = []; const instances: object[] = [];
    @Provider() class Boot { register(): void {} boot(context: InvocationContext): void {
      if (!context.container.has(BUN_JOB_CONTEXT)) context.container.value(invocation, "event-only");
      else { expect(context.container.has(caller)).toBe(false); expect(context.container.has(invocation)).toBe(false); }
    } }
    @Queue({ id: "listener.retry", tries: 2 }) @Listener(Payload) class Queued {
      constructor(private readonly context: BunJobContext) {}
      handle(): void {
        const attempt = this.context.envelope.attempts; instances.push(this); order.push(`handle:${attempt}`);
        expect(this.context.scope.container.has(caller)).toBe(false);
        this.context.scope.value(resource, {}, { dispose() { order.push(`dispose:${attempt}`); } });
        if (attempt === 1) throw new Error("retry listener");
      }
    }
    const driver = new MemoryQueueDriver(); const ack = vi.spyOn(driver, "acknowledge");
    const running = await start([Queued], { driver, worker: true, providers: [Boot], dependencies: new Map([[Queued, [{ index: 0, token: BUN_JOB_CONTEXT }]]]) });
    await running.app.rootContainer.get(BUN_EXECUTION_SCOPE_MANAGER).run("http-request", async (scope) => {
      scope.value(caller, "request-only"); await running.dispatcher.dispatch(new Payload("retry"));
    });
    await vi.waitFor(() => expect(ack).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["handle:1", "dispose:1", "handle:2", "dispose:2"]);
    expect(instances[0]).not.toBe(instances[1]); expect(await running.manager.listFailed()).toEqual([]);
  });
  it("persists invalid codec data once instead of retrying a queued listener", async () => {
    let handled = 0;
    @Queue({ id: "listener.decode-failure", tries: 5 }) @Listener(Payload) class Queued { handle(): void { handled++; } }
    const driver = new MemoryQueueDriver(); const release = vi.spyOn(driver, "release"); const fail = vi.spyOn(driver, "fail");
    const running = await start([Queued], { driver, worker: true, codecs: [{ ...codec, decode: () => { throw new Error("bad encoded event"); } }] });
    await running.dispatcher.dispatch(new Payload("invalid")); await vi.waitFor(() => expect(fail).toHaveBeenCalledTimes(1));
    expect(await running.manager.listFailed()).toMatchObject([{ reason: "invalid", envelope: { job: "listener.decode-failure", attempts: 1 }, error: { message: expect.stringContaining("bad encoded event") } }]);
    expect(release).not.toHaveBeenCalled(); expect(handled).toBe(0);
  });
  it("counts synchronous event decoding toward the cooperative timeout", async () => {
    @Queue({ id: "listener.decode-timeout", timeout: 1 }) @Listener(Payload) class Queued { handle(): void {} }
    const running = await start([Queued], { codecs: [{ ...codec, decode: (data) => {
      const until = performance.now() + 10; while (performance.now() < until) { /* timer cannot run */ }
      return codec.decode(data);
    } }] });
    await expect(running.dispatcher.dispatch(new Payload("slow"))).rejects.toThrow(/cooperative timeout/);
  });
  it("snapshots at ordered encounter and runs only the selected listener with reconstructed private state and fresh DI", async () => {
    const results: { event: Payload; context: BunJobContext; instance: object }[] = []; const direct: string[] = []; const boot: BunJobContext[] = [];
    @Provider() class Boot { register(): void {} boot(context: InvocationContext): void {
      if (context.container.has(BUN_JOB_CONTEXT)) boot.push(context.container.get(BUN_JOB_CONTEXT));
    } }
    @Listener(Payload) class First { handle(event: Payload): void { direct.push("first"); event.note = "snapshot"; } }
    @Queue({ id: "listener.private", tries: 2 }) @Listener(Payload) class Queued {
      constructor(private readonly context: BunJobContext) {} handle(event: Payload): void { results.push({ event, context: this.context, instance: this }); }
    }
    @Listener(Payload) class Last { handle(event: Payload): void { direct.push("last"); event.note = "later"; } }
    const running = await start([First, Queued, Last], { driver: new MemoryQueueDriver(), worker: true,
      dependencies: new Map([[Queued, [{ index: 0, token: BUN_JOB_CONTEXT }]]]), providers: [Boot] });
    const event = new Payload("private"); await running.dispatcher.dispatch(event); await running.dispatcher.dispatch(new Payload("second"));
    await vi.waitFor(() => expect(results).toHaveLength(2));
    expect(direct).toEqual(["first", "last", "first", "last"]); expect(event.note).toBe("later");
    expect(results[0]!.event).not.toBe(event); expect(results.map((entry) => entry.event.id)).toEqual(["private", "second"]);
    expect(results.every((entry) => entry.event.note === "snapshot" && entry.context.scope.kind === "queue-job")).toBe(true);
    expect(results[0]!.instance).not.toBe(results[1]!.instance); expect(results[0]!.context.scope).not.toBe(results[1]!.context.scope);
    expect(boot).toEqual(results.map((entry) => entry.context));
  });
  it("supports either decorator order and synchronous queue execution without event redispatch", async () => {
    const received: Payload[] = [];
    @Listener(Payload) @Queue({ id: "listener.sync" }) class Queued { handle(event: Payload): void { received.push(event); } }
    const running = await start([Queued]); const event = new Payload("sync"); await running.dispatcher.dispatch(event);
    expect(received).toHaveLength(1); expect(received[0]).not.toBe(event); expect(received[0]!.id).toBe("sync");
  });
  it("rejects missing/ambiguous codecs and duplicate shared delivery IDs at startup", async () => {
    @Queue({ id: "listener.same" }) @Listener(Payload) class First { handle(): void {} }
    @Listener(Payload) @Queue({ id: "listener.same" }) class Second { handle(): void {} }
    await expect(start([First], { codecs: [] })).rejects.toThrow(/one codec/);
    await expect(start([First, Second])).rejects.toThrow(/Duplicate job or queued-listener/);
    expect(() => new BunAdapter({ role: "command", queues: { driver: new SyncQueueDriver(), eventCodecs: [codec, codec] } })).toThrow(/unambiguous/);
  });
  it("propagates failed submission and skips later direct listeners", async () => {
    const order: string[] = []; const failure = new Error("push failed");
    @Listener(Payload) class First { handle(): void { order.push("first"); } }
    @Queue({ id: "listener.push" }) @Listener(Payload) class Queued { handle(): void {} }
    @Listener(Payload) class Last { handle(): void { order.push("last"); } }
    const driver = new MemoryQueueDriver(); vi.spyOn(driver, "push").mockImplementation(() => { throw failure; }); const running = await start([First, Queued, Last], { driver });
    await expect(running.dispatcher.dispatch(new Payload("x"))).rejects.toBe(failure); expect(order).toEqual(["first"]);
  });
  it("rejects wrong codec versions, malformed encoded values and noncanonical decode results as terminal failures", async () => {
    let handled = 0;
    @Queue({ id: "listener.invalid", tries: 5 }) @Listener(Payload) class Queued { handle(): void { handled++; } }
    const driver = new MemoryQueueDriver(); const push = vi.spyOn(driver, "push"); const running = await start([Queued], { driver });
    await running.dispatcher.dispatch(new Payload("x")); const envelope = push.mock.calls[0]![0];
    await expect(running.manager.executeAttempt({ ...envelope, payload: JSON.stringify([{ codec: { id: "payload", version: 2 }, data: { id: "x", note: "x" } }]) })).rejects.toMatchObject({ name: "InvalidJobError" });
    await expect(running.manager.executeAttempt({ ...envelope, payload: JSON.stringify([{ codec: { id: "payload", version: 1 }, data: { id: 5 } }]) })).rejects.toMatchObject({ name: "InvalidJobError" });
    const wrong = { ...codec, decode: () => ({ id: "x", note: "x" }) } as unknown as QueueEventCodec<Payload, { id: string; note: string }>;
    const wrongRun = await start([Queued], { codecs: [wrong] }); await expect(wrongRun.dispatcher.dispatch(new Payload("x"))).rejects.toThrow(/exact canonical event/); expect(handled).toBe(0);
  });
  it("does not affect explicit EventDispatcher replacement", async () => {
    let calls = 0;
    @Queue({ id: "listener.replace" }) @Listener(Payload) class Queued { handle(): never { throw new Error("not called"); } }
    class Replacement extends EventDispatcher { async dispatch(): Promise<void> { calls++; } }
    @Provider() class Bind { register(container: Container): void { container.instance(EventDispatcher, new Replacement()); } }
    const running = await start([Queued], { providers: [Bind] }); await running.dispatcher.dispatch(new Payload("x")); expect(calls).toBe(1);
  });
  it("validates codec identity and rejects asynchronous codec results at runtime", async () => {
    class Plain {} expect(() => defineQueueEventCodec({ id: "plain", version: 1, event: Plain, encode: () => ({}), decode: () => new Plain() })).toThrow(/canonical Core/);
    expect(() => defineQueueEventCodec({ ...codec, version: 0 })).toThrow(/version/); expect(Object.isFrozen(codec)).toBe(true);
    @Queue({ id: "listener.async" }) @Listener(Payload) class Queued { handle(): void {} }
    const asynchronous = { ...codec, encode: () => Promise.reject(new Error("invalid async encode")) } as unknown as QueueEventCodec<Payload, { id: string; note: string }>;
    const running = await start([Queued], { codecs: [asynchronous] }); await expect(running.dispatcher.dispatch(new Payload("x"))).rejects.toThrow(/synchronously/);
    const asyncDecode = { ...codec, decode: () => Promise.reject(new Error("invalid async decode")) } as unknown as QueueEventCodec<Payload, { id: string; note: string }>;
    const decoding = await start([Queued], { codecs: [asyncDecode] }); await expect(decoding.dispatcher.dispatch(new Payload("x"))).rejects.toThrow(/synchronously/);
  });
});
