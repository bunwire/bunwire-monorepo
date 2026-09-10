import { afterEach, describe, expect, it, vi } from "vitest";
import { createToken, defineApp, defineRuntimeRegistry, defineManagedMethodPlan, getManagedClassMetadata, Provider, type Application } from "@bunwire/core";
import { BUN_JOB_CONTEXT, BUN_JOB_HANDLE_KIND, BUN_JOB_KIND, BUN_QUEUE_MANAGER, BUN_QUEUE_WORKER, BUN_EXECUTION_SCOPE_MANAGER,
  BunAdapter, BunJobFatalError, Job, MemoryQueueDriver, MemoryFailedJobStore, SyncQueueDriver,
  type BunJobContext, type JobConstructor, type BunQueueWorkerOptions, type QueueEnvelope, type QueueReservation, type JobPolicy } from "@bunwire/bun";

const apps: Application[] = [];
const releases: (() => void)[] = [];
afterEach(async () => { releases.splice(0).forEach((release) => release()); await Promise.allSettled(apps.splice(0).map((app) => app.stop())); vi.useRealTimers(); });
function gate() { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); releases.push(resolve); return { promise, resolve }; }
const tick = (ms = 1) => vi.advanceTimersByTimeAsync(ms);
function registry(target: JobConstructor, policy: Partial<JobPolicy> = {}) {
  return defineRuntimeRegistry({ classes: [{ target, kind: BUN_JOB_KIND, scope: "transient", dependencies: [{ index: 0, token: BUN_JOB_CONTEXT }],
    data: { ...getManagedClassMetadata(target)!.data as object, queue: "default", tries: 3, backoff: [10, 20], ...policy } }],
    methods: [defineManagedMethodPlan({ target, kind: BUN_JOB_HANDLE_KIND, ownerKind: BUN_JOB_KIND, method: "handle", data: undefined, parameters: [] })] });
}
@Job({ id: "worker.noop" }) class Noop { constructor(_context: BunJobContext) {} handle(): void {} }
async function start(target: JobConstructor = Noop, options: { driver?: MemoryQueueDriver; store?: MemoryFailedJobStore; worker?: BunQueueWorkerOptions; policy?: Partial<JobPolicy>; signals?: boolean } = {}) {
  vi.useFakeTimers(); const driver = options.driver ?? new MemoryQueueDriver(); const store = options.store ?? new MemoryFailedJobStore();
  const app = defineApp().withAdapter(new BunAdapter({ role: "worker", handleSignals: options.signals ?? false,
    queues: { driver, failedJobs: store, worker: { pollIntervalMs: 5, leaseDurationMs: 300, ...options.worker } } })).withRuntimeRegistry(registry(target, options.policy));
  apps.push(app); await app.start(); return { app, driver, store, manager: app.rootContainer.get(BUN_QUEUE_MANAGER), worker: app.rootContainer.get(BUN_QUEUE_WORKER) };
}

describe("worker startup and scheduling", () => {
  it("requires a capable explicit driver and validates immutable worker settings", async () => {
    expect(() => new BunAdapter({ role: "worker" })).toThrow(/explicit QueueDriver/);
    expect(() => new BunAdapter({ role: "worker", queues: { driver: new SyncQueueDriver() } })).toThrow(/renewal/);
    expect(() => new BunAdapter({ role: "command", queues: { driver: new MemoryQueueDriver(), worker: {} } })).not.toThrow();
    for (const worker of [{ queues: [] }, { queues: ["a", "a"] }, { queues: [" "] }, { queues: null }, { concurrency: 0 }, { concurrency: null }, { pollIntervalMs: 1.2 }, { leaseDurationMs: -1 }]) {
      expect(() => new BunAdapter({ role: "worker", queues: { driver: new MemoryQueueDriver(), worker: worker as BunQueueWorkerOptions } })).toThrow();
    }
    const queues = ["first"]; const running = await start(Noop, { worker: { queues } }); queues.push("second");
    expect(running.worker.options.queues).toEqual(["first"]); expect(Object.isFrozen(running.worker.options.queues)).toBe(true);
    expect(running.worker.options.concurrency).toBe(1); await running.app.stop(); await expect(running.worker.done).resolves.toBeUndefined();
  });
  it("waits for Core running and cancels startup without reserving on immediate stop", async () => {
    const first = await start(); const reserve = vi.spyOn(first.driver, "reserve");
    expect(first.worker.state).toBe("starting"); expect(reserve).not.toHaveBeenCalled();
    await first.app.stop(); await tick(); expect(reserve).not.toHaveBeenCalled(); expect(first.worker.state).toBe("stopped");
    const second = await start(); const states: string[] = []; const original = second.driver.reserve.bind(second.driver);
    vi.spyOn(second.driver, "reserve").mockImplementation((...args) => { states.push(second.app.state); return original(...args); });
    await second.manager.job(Noop).dispatch(); await tick(); expect(states.length).toBeGreaterThan(0); expect(new Set(states)).toEqual(new Set(["running"]));
  });
  it("polls queues fairly and acknowledges successful attempts after scope disposal", async () => {
    const seen: string[] = []; const cleanup: string[] = []; const resource = createToken<object>("worker.fair-resource");
    @Job({ id: "worker.fair" }) class Test { constructor(private readonly context: BunJobContext) {} handle(): void {
      seen.push(this.context.envelope.queue); this.context.scope.value(resource, {}, { dispose: () => { cleanup.push(this.context.envelope.id); } });
    } }
    const running = await start(Test, { worker: { queues: ["a", "b"] } }); const original = running.driver.acknowledge.bind(running.driver);
    const ack = vi.spyOn(running.driver, "acknowledge").mockImplementation((reservation) => { expect(cleanup).toContain(reservation.envelope.id); original(reservation); });
    for (const queue of ["a", "a", "a", "b"]) await running.manager.job(Test).onQueue(queue).dispatch();
    await tick(); expect(seen).toEqual(["a", "b", "a", "a"]); expect(ack).toHaveBeenCalledTimes(4); expect(running.worker.activeCount).toBe(0);
  });
  it("limits concurrent attempts and gives each a fresh isolated scope", async () => {
    const finish = gate(); const contexts: BunJobContext[] = [];
    @Job({ id: "worker.concurrent" }) class Test { constructor(private readonly context: BunJobContext) {} async handle(): Promise<void> { contexts.push(this.context); await finish.promise; } }
    const running = await start(Test, { worker: { concurrency: 2 } });
    for (let i = 0; i < 3; i++) await running.manager.job(Test).dispatch(); await tick();
    expect(contexts).toHaveLength(2); expect(running.worker.activeCount).toBe(2); expect(contexts[0]!.scope).not.toBe(contexts[1]!.scope);
    finish.resolve(); await tick(); expect(contexts).toHaveLength(3); expect(new Set(contexts.map((context) => context.scope)).size).toBe(3);
  });
});

describe("worker attempt settlement", () => {
  it("consumes an explicit retry of a failed job under a fresh ID and retains the original record", async () => {
    const attempts: { id: string; attempt: number }[] = []; let succeed = false;
    @Job({ id: "worker.retry-failed" }) class Test {
      constructor(private readonly context: BunJobContext) {}
      handle(): void {
        attempts.push({ id: this.context.envelope.id, attempt: this.context.envelope.attempts });
        if (!succeed) throw new Error("first delivery fails");
      }
    }
    const running = await start(Test, { policy: { tries: 1 } }); const ack = vi.spyOn(running.driver, "acknowledge");
    const original = await running.manager.job(Test).dispatch(); await tick();
    expect(await running.manager.getFailed(original.id)).toMatchObject({ reason: "exhausted" });
    ack.mockClear(); succeed = true; const retried = await running.manager.retryFailed(original.id); await tick(10);
    expect(retried.id).not.toBe(original.id);
    expect(attempts).toEqual([{ id: original.id, attempt: 1 }, { id: retried.id, attempt: 1 }]);
    expect(ack).toHaveBeenCalledTimes(1); expect(await running.manager.listFailed()).toHaveLength(1);
    expect(await running.manager.forgetFailed(original.id)).toBe(true); expect(await running.manager.listFailed()).toEqual([]);
  });
  it("retries with clamped backoff and records exhausted work before terminal removal", async () => {
    const attempts: number[] = [];
    @Job({ id: "worker.retry" }) class Test { constructor(private readonly context: BunJobContext) {} handle(): never { attempts.push(this.context.envelope.attempts); throw new Error("retry me"); } }
    const running = await start(Test, { policy: { tries: 4 } }); const release = vi.spyOn(running.driver, "release");
    const original = running.driver.fail.bind(running.driver); const fail = vi.spyOn(running.driver, "fail").mockImplementation((reservation, error) => {
      expect(running.store.get(reservation.envelope.id)?.reason).toBe("exhausted"); original(reservation, error);
    });
    await running.manager.job(Test).dispatch(); await tick(100);
    expect(attempts).toEqual([1, 2, 3, 4]); expect(release.mock.calls.map((call) => call[1])).toEqual([10, 20, 20]); expect(fail).toHaveBeenCalledTimes(1);
    expect(await running.manager.listFailed()).toMatchObject([{ envelope: { attempts: 4 }, error: { message: "retry me" } }]);
  });
  it("does not retry fatal or invalid identities even when tries remain", async () => {
    @Job({ id: "worker.fatal" }) class Test { constructor(_context: BunJobContext) {} handle(): never { throw new BunJobFatalError("fatal"); } }
    const running = await start(Test); await running.manager.job(Test).dispatch();
    running.driver.push({ version: 1, id: "invalid", job: "missing", payload: "[]", serializer: { id: "bun.json", version: 1 }, queue: "default", attempts: 0,
      createdAt: Date.now(), availableAt: Date.now(), policy: { tries: 99, backoff: [] } });
    await tick(); expect((await running.manager.listFailed()).map((entry) => entry.reason)).toEqual(["fatal", "invalid"]);
  });
  it("waits for an ignored timeout before retrying and disposes the first scope first", async () => {
    const finish = gate(); const contexts: BunJobContext[] = [];
    @Job({ id: "worker.timeout" }) class Test { constructor(private readonly context: BunJobContext) {} async handle(): Promise<void> { contexts.push(this.context); if (contexts.length === 1) await finish.promise; } }
    const running = await start(Test, { policy: { timeout: 10, backoff: [] } }); await running.manager.job(Test).dispatch(); await tick(20);
    expect(contexts).toHaveLength(1); expect(contexts[0]!.signal.aborted).toBe(true); expect(contexts[0]!.scope.state).toBe("active");
    finish.resolve(); await tick(10); expect(contexts).toHaveLength(2); expect(contexts[0]!.scope.state).toBe("disposed"); expect(await running.manager.listFailed()).toEqual([]);
  });
  it("renews through slow resource disposal and failed-record persistence", async () => {
    const cleanup = gate(); const persist = gate(); const resource = createToken<object>("worker.slow-cleanup");
    @Job({ id: "worker.renew" }) class Test { constructor(private readonly context: BunJobContext) {} handle(): never {
      this.context.scope.value(resource, {}, { dispose: () => cleanup.promise }); throw new BunJobFatalError("terminal");
    } }
    const running = await start(Test); const renew = vi.spyOn(running.driver, "renew"); const fail = vi.spyOn(running.driver, "fail");
    const save = running.store.save.bind(running.store); vi.spyOn(running.store, "save").mockImplementation(async (record) => { await persist.promise; save(record); });
    await running.manager.job(Test).dispatch(); await tick(250); expect(renew).toHaveBeenCalledTimes(2); expect(fail).not.toHaveBeenCalled();
    cleanup.resolve(); await tick(250); expect(renew).toHaveBeenCalledTimes(5); expect(fail).not.toHaveBeenCalled();
    persist.resolve(); await tick(); expect(fail).toHaveBeenCalledTimes(1); const count = renew.mock.calls.length; await tick(400); expect(renew).toHaveBeenCalledTimes(count);
  });
});

describe("worker shutdown and infrastructure failures", () => {
  it("quiesces an in-flight renewal before acknowledgement", async () => {
    const finish = gate(); const renewed = gate();
    @Job({ id: "worker.quiesce" }) class Test { constructor(_context: BunJobContext) {} async handle(): Promise<void> { await finish.promise; } }
    const running = await start(Test); const original = running.driver.renew.bind(running.driver);
    vi.spyOn(running.driver, "renew").mockImplementation((async (reservation: QueueReservation, duration: number) => { await renewed.promise; return original(reservation, duration); }) as never);
    const ack = vi.spyOn(running.driver, "acknowledge"); await running.manager.job(Test).dispatch(); await tick(101);
    finish.resolve(); await tick(); expect(ack).not.toHaveBeenCalled(); renewed.resolve(); await tick(); expect(ack).toHaveBeenCalledTimes(1);
  });
  it.each(["reserve", "acknowledge"] as const)("propagates %s infrastructure failure through done and Core stop", async (operation) => {
    const running = await start(); const failure = new Error(`${operation} failure`);
    vi.spyOn(running.driver, operation).mockImplementation(() => { throw failure; });
    await running.manager.job(Noop).dispatch(); await tick(); await expect(running.worker.done).rejects.toBe(failure);
    await expect(running.app.stop()).rejects.toBe(failure); expect(running.app.state).toBe("failed");
  });
  it("retries cleanup failure and only acknowledges an attempt whose cleanup succeeds", async () => {
    let count = 0; const resource = createToken<object>("worker.retry-cleanup");
    @Job({ id: "worker.cleanup-retry" }) class Test { constructor(private readonly context: BunJobContext) {} handle(): void {
      const attempt = ++count; this.context.scope.value(resource, {}, { dispose() { if (attempt === 1) throw new Error("cleanup"); } });
    } }
    const running = await start(Test, { policy: { backoff: [] } }); const ack = vi.spyOn(running.driver, "acknowledge"); const release = vi.spyOn(running.driver, "release");
    await running.manager.job(Test).dispatch(); await tick(); expect(count).toBe(2); expect(ack).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledTimes(1);
  });
  it("finishes active work with renewal and keeps signal handlers until resources are closed", async () => {
    const finish = gate(); let context!: BunJobContext;
    @Job({ id: "worker.shutdown" }) class Test { constructor(value: BunJobContext) { context = value; } async handle(): Promise<void> { await finish.promise; } }
    const initial = process.listenerCount("SIGTERM"); const running = await start(Test, { signals: true }); const renew = vi.spyOn(running.driver, "renew");
    const ack = vi.spyOn(running.driver, "acknowledge"); await running.manager.job(Test).dispatch(); await tick();
    const stopping = running.app.stop(); await tick(400); expect(context.signal.aborted).toBe(false); expect(renew.mock.calls.length).toBeGreaterThan(0);
    expect(process.listenerCount("SIGTERM")).toBe(initial + 1); expect(running.worker.state).toBe("stopping");
    await expect(running.manager.job(Test).dispatch()).rejects.toThrow(/running Application/);
    finish.resolve(); await stopping; expect(ack).toHaveBeenCalledTimes(1); expect(process.listenerCount("SIGTERM")).toBe(initial); expect(running.worker.state).toBe("stopped");
  });
  it("releases reservations arriving after shutdown without executing them", async () => {
    const waiting = gate(); const driver = new MemoryQueueDriver(); const original = driver.reserve.bind(driver); let late: QueueReservation | undefined;
    vi.spyOn(driver, "reserve").mockImplementation((async (...args: [string, number]) => { late = original(...args); await waiting.promise; return late; }) as never);
    const release = vi.spyOn(driver, "release"); const ack = vi.spyOn(driver, "acknowledge"); const running = await start(Noop, { driver });
    await running.manager.job(Noop).dispatch(); await tick(); expect(late).toBeDefined(); const stopping = running.app.stop(); waiting.resolve(); await stopping;
    expect(release).toHaveBeenCalledWith(late); expect(ack).not.toHaveBeenCalled();
  });
  it("never settles a lost lease and waits for the real handler before failed shutdown", async () => {
    const finish = gate(); let context!: BunJobContext; const failure = new Error("lease lost");
    @Job({ id: "worker.lost" }) class Test { constructor(value: BunJobContext) { context = value; } async handle(): Promise<void> { await finish.promise; } }
    const running = await start(Test); vi.spyOn(running.driver, "renew").mockImplementation(() => { throw failure; });
    const ack = vi.spyOn(running.driver, "acknowledge"); const fail = vi.spyOn(running.driver, "fail"); const release = vi.spyOn(running.driver, "release");
    await running.manager.job(Test).dispatch(); await tick(101); expect(context.signal.aborted).toBe(true); expect(running.app.state).toBe("stopping");
    const stopped = running.app.stop().catch((error: unknown) => error); finish.resolve(); expect(await stopped).toBe(failure); await expect(running.worker.done).rejects.toBe(failure);
    expect(ack).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled(); expect(release).not.toHaveBeenCalled(); expect(running.app.state).toBe("failed");
  });
  it("does not discard work when failed-record persistence fails and still disposes manual scopes", async () => {
    @Job({ id: "worker.save-failure" }) class Test { constructor(_context: BunJobContext) {} handle(): never { throw new BunJobFatalError("terminal"); } }
    const running = await start(Test); const failure = new Error("storage down"); vi.spyOn(running.store, "save").mockImplementation(() => { throw failure; });
    const fail = vi.spyOn(running.driver, "fail"); const ack = vi.spyOn(running.driver, "acknowledge"); const cleanup = vi.fn();
    running.app.rootContainer.get(BUN_EXECUTION_SCOPE_MANAGER).create("command").value(createToken<object>("worker.manual"), {}, { dispose: cleanup });
    await running.manager.job(Test).dispatch(); await tick(); await expect(running.worker.done).rejects.toBe(failure); await expect(running.app.stop()).rejects.toBe(failure);
    expect(fail).not.toHaveBeenCalled(); expect(ack).not.toHaveBeenCalled(); expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
