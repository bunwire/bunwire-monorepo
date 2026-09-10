import { afterEach, describe, expect, it, vi } from "vitest";
import { createToken, Provider, defineApp, defineRuntimeRegistry, defineManagedMethodPlan, getManagedClassMetadata, type Application, type RuntimeToken, type InvocationContext } from "@bunwire/core";
import { Job, BUN_JOB_KIND, BUN_JOB_HANDLE_KIND, BunAdapter, BUN_QUEUE_MANAGER, BUN_EXECUTION_SCOPE, BUN_EXECUTION_SCOPE_MANAGER,
  JsonJobSerializer, SyncQueueDriver, MemoryQueueDriver, JobDispatchBuilder, type JobConstructor, type QueueEnvelope, type BunExecutionScope, type BunQueueOptions } from "@bunwire/bun";
const apps: Application[] = [];
afterEach(async () => { await Promise.allSettled(apps.splice(0).map((app) => app.stop())); });
function registry(target: JobConstructor, count = 1, dependencies: readonly { index: number; token: RuntimeToken }[] = []) {
  return defineRuntimeRegistry({ classes: [{ kind: BUN_JOB_KIND, target, scope: "transient", dependencies,
    data: { ...getManagedClassMetadata(target)!.data as object, queue: "default", tries: 2, backoff: [10] } }],
    methods: [defineManagedMethodPlan({ target, kind: BUN_JOB_HANDLE_KIND, ownerKind: BUN_JOB_KIND, method: "handle", data: undefined,
      parameters: Array.from({ length: count }, (_, index) => ({ source: "transport" as const, methodIndex: index, argumentIndex: index, optional: false })) })] });
}
async function start(target: JobConstructor, options?: BunQueueOptions, count = 1, dependencies: readonly { index: number; token: RuntimeToken }[] = []) {
  const app = defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false, ...(options ? { queues: options } : {}) })).withRuntimeRegistry(registry(target, count, dependencies));
  apps.push(app); await app.start(); return { app, manager: app.rootContainer.get(BUN_QUEUE_MANAGER) };
}
@Job({ id: "test.noop" })
class Noop { handle(_value: string): void {} }
const envelope = (id = "one", queue = "default", availableAt = 0): QueueEnvelope => ({ version: 1, id, job: "test.noop", payload: '["payload"]', serializer: { id: "bun.json", version: 1 }, queue, attempts: 0, createdAt: 0, availableAt, policy: { tries: 2, backoff: [] } });

describe("strict job serialization", () => {
  const serializer = new JsonJobSerializer();
  it("round trips JSON argument tuples and omitted optional values", () => {
    const args = ["id", null, { list: [1, true, 1.5] }];
    expect(serializer.deserialize(serializer.serialize(args))).toEqual(args);
    expect(serializer.deserialize("[]")).toEqual([]);
  });
  it.each([undefined, NaN, Infinity, -0, Number.MAX_SAFE_INTEGER + 1, 1n, Symbol("x"), () => {}, new Date(), new Map(), new class {}(), new class extends Array { toJSON() { throw new Error("must not execute"); } }(), [, 1]])("rejects unsupported value %#", (value) => {
    expect(() => serializer.serialize([value])).toThrow();
  });
  it("rejects cycles, hidden data and accessors without invoking them", () => {
    const value: unknown[] = []; value.push(value);
    expect(() => serializer.serialize(value)).toThrow(/cycles/);
    const getter = vi.fn(); const accessor = Object.defineProperty({}, "x", { get: getter, enumerable: true });
    expect(() => serializer.serialize([accessor])).toThrow(/accessors/); expect(getter).not.toHaveBeenCalled();
    expect(() => serializer.serialize([Object.defineProperty({}, "hidden", { value: 1 })])).toThrow();
    expect(() => serializer.deserialize("{}" )).toThrow(/tuple/);
    expect(() => serializer.deserialize("[" )).toThrow(/JSON/);
  });
});
describe("queue dispatch and execution", () => {
  it("shares even re-entrant dispatch and repeated validation failures", async () => {
    let inner: Promise<unknown> | undefined;
    const submit = vi.fn(async () => { inner = builder.dispatch(); return { id: "one", job: "test", queue: "default" }; });
    const builder = new JobDispatchBuilder(submit);
    const promise = builder.dispatch(); expect(inner).toBe(promise); await promise; expect(submit).toHaveBeenCalledTimes(1);
    const failed = new JobDispatchBuilder(() => { throw new Error("invalid"); });
    const rejection = failed.dispatch(); expect(failed.dispatch()).toBe(rejection); await expect(rejection).rejects.toThrow("invalid");
  });
  it("copies payload values at submission, not builder creation, and freezes defaults independently", async () => {
    @Job({ id: "test.snapshot" }) class Snapshot { handle(_value: { id: string }): void {} }
    const driver = new MemoryQueueDriver(); const push = vi.spyOn(driver, "push");
    const { manager } = await start(Snapshot, { driver });
    const payload = { id: "before" }; const builder = manager.job(Snapshot, payload);
    payload.id = "submitted"; const pending = builder.dispatch(); payload.id = "after"; await pending;
    expect(push.mock.calls[0]![0].payload).toBe('[{"id":"submitted"}]');
    expect(push.mock.calls[0]![0].policy).toEqual({ tries: 2, backoff: [10] });
    expect(push.mock.calls[0]![0].queue).toBe("default");
  });
  it("preserves handler and scope-disposal failures together", async () => {
    const handler = new Error("handler"); const cleanup = new Error("cleanup"); const resource = createToken<object>("test.resource");
    @Job({ id: "test.cleanup" }) class Cleanup {
      constructor(private readonly scope: BunExecutionScope) {}
      handle(): never { this.scope.value(resource, {}, { dispose() { throw cleanup; } }); throw handler; }
    }
    const { manager } = await start(Cleanup, { driver: new SyncQueueDriver() }, 0, [{ index: 0, token: BUN_EXECUTION_SCOPE }]);
    await expect(manager.job(Cleanup).dispatch()).rejects.toMatchObject({ errors: [handler, cleanup] });
  });
  it("initializes after Providers and registry delivery; rolls back partial initialization exactly once", async () => {
    const order: string[] = []; const failure = new Error("initialize"); const cleanup = new Error("close");
    @Provider() class Setup { register(): void { order.push("register"); } }
    class Broken extends MemoryQueueDriver {
      override initialize(): void { order.push("initialize"); throw failure; }
      override close(): void { order.push("close"); throw cleanup; }
    }
    const app = defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false, queues: { driver: new Broken() } })).withProviders(Setup).withRuntimeRegistry(registry(Noop));
    await expect(app.start()).rejects.toMatchObject({ errors: [failure, cleanup] });
    expect(order).toEqual(["register", "initialize", "close"]); expect(app.state).toBe("failed");
    await app.stop(); expect(order).toEqual(["register", "initialize", "close"]);
  });
  it("passes job scopes through Provider.boot and removes signals only after driver close", async () => {
    let bootScope: BunExecutionScope | undefined; let jobScope: BunExecutionScope | undefined;
    @Provider() class Boot { register(): void {} boot(context: InvocationContext): void { bootScope = context.container.get(BUN_EXECUTION_SCOPE); } }
    @Job({ id: "test.boot" }) class BootJob { constructor(private readonly scope: BunExecutionScope) {} handle(): void { jobScope = this.scope; } }
    const initial = process.listenerCount("SIGTERM"); let closingCount = 0;
    const driver = new SyncQueueDriver(); vi.spyOn(driver, "close").mockImplementation(() => { closingCount = process.listenerCount("SIGTERM"); });
    const app = defineApp().withAdapter(new BunAdapter({ role: "scheduler", queues: { driver } })).withProviders(Boot)
      .withRuntimeRegistry(registry(BootJob, 0, [{ index: 0, token: BUN_EXECUTION_SCOPE }]));
    apps.push(app); await app.start();
    await app.rootContainer.get(BUN_QUEUE_MANAGER).job(BootJob).dispatch();
    expect(jobScope).toBe(bootScope); expect(jobScope?.kind).toBe("queue-job");
    await app.stop(); expect(closingCount).toBe(initial + 1); expect(process.listenerCount("SIGTERM")).toBe(initial);
  });
  it("validates generated job identity and requires its intrinsic plan", async () => {
    const original = registry(Noop); const entry = original.classes[0]!;
    const invalid = defineRuntimeRegistry({ ...original, classes: [{ ...entry, data: { ...entry.data as object, id: "different" } }] });
    const app = defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false })).withRuntimeRegistry(invalid);
    await expect(app.start()).rejects.toThrow(/identity/);
    const missing = defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false })).withRuntimeRegistry(defineRuntimeRegistry({ classes: original.classes }));
    await expect(missing.start()).rejects.toThrow(/missing required method/);
  });
  it("snapshots at explicit submission, preserves defaults and overrides, and shares repeated dispatch", async () => {
    const driver = new MemoryQueueDriver(); const push = vi.spyOn(driver, "push");
    const { app, manager } = await start(Noop, { driver });
    const builder = manager.job(Noop, "hello").onQueue("priority").delay(50).tries(4);
    expect(push).not.toHaveBeenCalled(); expect("then" in builder).toBe(false); expect(Object.isFrozen(builder)).toBe(true);
    const pending = builder.dispatch(); expect(builder.dispatch()).toBe(pending);
    const receipt = await pending; const sent = push.mock.calls[0]![0];
    expect(receipt).toEqual({ id: sent.id, job: "test.noop", queue: "priority" });
    expect(sent).toMatchObject({ version: 1, attempts: 0, payload: '["hello"]', policy: { tries: 4, backoff: [10] } });
    expect(sent.availableAt - sent.createdAt).toBe(50); expect(Object.isFrozen(sent.policy.backoff)).toBe(true);
    await manager.job(Noop, "other").dispatch(); expect(push.mock.calls[1]![0].id).not.toBe(sent.id);
    await app.stop(); await expect(manager.job(Noop, "late").dispatch()).rejects.toThrow(/running/);
  });
  it("requires explicit configuration, canonical registration and valid payload counts/options", async () => {
    const { manager } = await start(Noop);
    await expect(manager.job(Noop, "x").dispatch()).rejects.toThrow(/explicit/);
    const configured = await start(Noop, { driver: new SyncQueueDriver() });
    class Fake { handle(): void {} }
    await expect(configured.manager.job(Fake).dispatch()).rejects.toThrow(/registry/);
    await expect(configured.manager.job(Noop, "x").delay(1).dispatch()).rejects.toThrow(/delayed/);
    expect(() => configured.manager.job(Noop, "x").tries(0)).toThrow();
    expect(() => new BunAdapter({ queues: {} as BunQueueOptions })).toThrow(/QueueDriver/);
    // @ts-expect-error payload tuple requires a string
    await expect(configured.manager.job(Noop, 42, "extra").dispatch()).rejects.toThrow(/count/);
  });
  it("checks incoming envelope identity/version and custom serializer tuple output", async () => {
    const driver = new SyncQueueDriver(); await start(Noop, { driver });
    expect(() => driver.reserve("default", 100)).toThrow(/reservations/);
    await expect(driver.push({ ...envelope(), job: "not.registered" })).rejects.toThrow(/Unknown job/);
    await expect(driver.push({ ...envelope(), serializer: { id: "bun.json", version: 2 } })).rejects.toThrow(/serializer version/);
    const deserialize = vi.fn(() => []);
    const custom = await start(Noop, { driver: new SyncQueueDriver(), serializer: {
      id: "test.custom", version: 1, serialize: () => "custom payload", deserialize,
    } });
    await expect(custom.manager.job(Noop, "input").dispatch()).rejects.toThrow(/argument count/);
    expect(deserialize).toHaveBeenCalledWith("custom payload");
  });
  it("sync deserializes and isolates transient jobs, scopes and cleanup from request callers", async () => {
    const seen: { instance: object; scope: BunExecutionScope; value: object }[] = [];
    @Job({ id: "test.scoped" })
    class Scoped {
      constructor(private readonly scope: BunExecutionScope) {}
      handle(value: object): void { seen.push({ instance: this, scope: this.scope, value }); }
    }
    const { app, manager } = await start(Scoped, { driver: new SyncQueueDriver() }, 1, [{ index: 0, token: BUN_EXECUTION_SCOPE }]);
    const payload = { x: 1 }; const scopes = app.rootContainer.get(BUN_EXECUTION_SCOPE_MANAGER);
    await scopes.run("http-request", async () => { await Promise.all([manager.job(Scoped, payload).dispatch(), manager.job(Scoped, payload).dispatch()]); });
    expect(seen).toHaveLength(2); expect(seen[0]!.instance).not.toBe(seen[1]!.instance);
    expect(seen[0]!.scope.id).not.toBe(seen[1]!.scope.id); expect(seen[0]!.scope.kind).toBe("queue-job");
    expect(seen[0]!.scope.parent).toBe(scopes.applicationScope); expect(seen[0]!.value).not.toBe(payload);
    expect(seen[0]!.scope.state).toBe("disposed");
  });
  it("waits for accepted sync work, then closes the driver and rejects new work", async () => {
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); let entered = false;
    @Job({ id: "test.wait" }) class Wait { async handle(): Promise<void> { entered = true; await gate; } }
    const driver = new SyncQueueDriver(); const close = vi.spyOn(driver, "close");
    const { app, manager } = await start(Wait, { driver }, 0);
    const pending = manager.job(Wait).dispatch(); await vi.waitFor(() => expect(entered).toBe(true));
    const stopping = app.stop(); expect(close).not.toHaveBeenCalled();
    expect(() => app.rootContainer.get(BUN_EXECUTION_SCOPE_MANAGER).create("command")).toThrow(/closing/);
    await expect(manager.job(Wait).dispatch()).rejects.toThrow(/running/);
    release(); await pending; await stopping; expect(close).toHaveBeenCalledTimes(1);
  });
  it("retains active job disposal failures during shutdown and still closes the driver", async () => {
    const failure = new Error("active scope cleanup"); const token = createToken<object>("test.active.cleanup");
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); let entered = false;
    @Job({ id: "test.active-cleanup" }) class Active {
      constructor(private readonly scope: BunExecutionScope) {}
      async handle(): Promise<void> { this.scope.value(token, {}, { dispose() { throw failure; } }); entered = true; await gate; }
    }
    const driver = new SyncQueueDriver(); const close = vi.spyOn(driver, "close");
    const { app, manager } = await start(Active, { driver }, 0, [{ index: 0, token: BUN_EXECUTION_SCOPE }]);
    const pending = manager.job(Active).dispatch(); await vi.waitFor(() => expect(entered).toBe(true));
    const stopping = app.stop(); const execution = expect(pending).rejects.toBe(failure); const shutdown = expect(stopping).rejects.toBe(failure);
    release(); await execution; await shutdown; expect(close).toHaveBeenCalledTimes(1); expect(app.state).toBe("failed");
  });
  it("propagates original execution errors and cleanup errors and prohibits shared drivers", async () => {
    const failure = new Error("handler failed");
    @Job({ id: "test.fail" }) class Failed { handle(): never { throw failure; } }
    const driver = new SyncQueueDriver(); const { app, manager } = await start(Failed, { driver }, 0);
    await expect(manager.job(Failed).dispatch()).rejects.toBe(failure);
    await expect(start(Noop, { driver })).rejects.toThrow(/shared/);
    const cleanup = new Error("driver close failed"); vi.spyOn(driver, "close").mockImplementation(() => { throw cleanup; });
    await expect(app.stop()).rejects.toBe(cleanup); expect(app.state).toBe("failed");
  });
});
describe("memory queue leases", () => {
  it("orders delayed availability, isolates queues and fences stale leases on expiry/release", () => {
    let now = 0; const driver = new MemoryQueueDriver({ now: () => now }); driver.initialize({ execute: async () => {} });
    driver.push(envelope("later", "a", 20)); driver.push(envelope("first", "a")); driver.push(envelope("second", "a")); driver.push(envelope("other", "b"));
    const first = driver.reserve("a", 10)!; expect(first.envelope.id).toBe("first"); expect(first.envelope.attempts).toBe(1);
    const second = driver.reserve("a", 10)!; expect(second.envelope.id).toBe("second"); driver.acknowledge(second);
    expect(driver.reserve("a", 10)).toBeUndefined(); now = 10;
    const redelivery = driver.reserve("a", 10)!; expect(redelivery.envelope.attempts).toBe(2);
    expect(() => driver.acknowledge(first)).toThrow(/stale/); expect(() => driver.release(first)).toThrow(/stale/); expect(() => driver.fail(first, "x")).toThrow(/stale/);
    driver.release(redelivery, 15); expect(driver.reserve("a", 10)).toBeUndefined(); now = 20;
    driver.fail(driver.reserve("a", 10)!, new Error("terminal")); now = 25;
    const released = driver.reserve("a", 10)!; expect(released.envelope.attempts).toBe(3); driver.acknowledge(released);
    expect(driver.reserve("a", 10)).toBeUndefined(); expect(driver.reserve("b", 10)?.envelope.id).toBe("other");
    driver.close(); expect(() => driver.reserve("a", 10)).toThrow(/open/);
  });
});
