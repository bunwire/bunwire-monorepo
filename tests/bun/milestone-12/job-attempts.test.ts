import { afterEach, describe, expect, it, vi } from "vitest";
import { createToken, defineApp, defineRuntimeRegistry, defineManagedMethodPlan, getManagedClassMetadata, Provider, type Application, type InvocationContext } from "@bunwire/core";
import { BUN_JOB_CONTEXT, BUN_JOB_HANDLE_KIND, BUN_JOB_KIND, BUN_QUEUE_MANAGER, BunAdapter, Job, SyncQueueDriver, type BunJobContext, type JobConstructor } from "@bunwire/bun";

const apps: Application[] = [];
afterEach(async () => { vi.useRealTimers(); await Promise.allSettled(apps.splice(0).map((app) => app.stop())); });
function deferred() { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; }
async function start(target: JobConstructor, timeout?: number, provider?: typeof Setup) {
  const driver = new SyncQueueDriver();
  const app = defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false, queues: { driver } }));
  if (provider) app.withProviders(provider);
  app.withRuntimeRegistry(defineRuntimeRegistry({ classes: [{ kind: BUN_JOB_KIND, target, scope: "transient", dependencies: [{ index: 0, token: BUN_JOB_CONTEXT }],
    data: { ...getManagedClassMetadata(target)!.data as object, queue: "default", tries: 3, backoff: [], ...(timeout === undefined ? {} : { timeout }) } }],
    methods: [defineManagedMethodPlan({ target, kind: BUN_JOB_HANDLE_KIND, ownerKind: BUN_JOB_KIND, method: "handle", data: undefined, parameters: [] })] }));
  apps.push(app); await app.start(); return { app, driver, manager: app.rootContainer.get(BUN_QUEUE_MANAGER) };
}
let bootContext: BunJobContext | undefined;
@Provider() class Setup { register(): void {} boot(context: InvocationContext): void { bootContext = context.container.get(BUN_JOB_CONTEXT); } }

describe("shared job attempt boundary", () => {
  it("starts timeout cancellation before Provider boot and awaits boot settlement", async () => {
    vi.useFakeTimers(); const entered = deferred(); const finish = deferred(); let context!: BunJobContext;
    @Provider() class SlowBoot { register(): void {} async boot(invocation: InvocationContext): Promise<void> {
      context = invocation.container.get(BUN_JOB_CONTEXT); entered.resolve(); await finish.promise;
    } }
    @Job({ id: "attempt.boot-timeout" }) class Test { constructor(_context: BunJobContext) {} handle(): void {} }
    const { manager } = await start(Test, 10, SlowBoot); const pending = manager.job(Test).dispatch();
    const checked = expect(pending).rejects.toThrow(/cooperative timeout/);
    await entered.promise; await vi.advanceTimersByTimeAsync(15);
    expect(context.signal.aborted).toBe(true); expect(context.scope.state).toBe("active");
    finish.resolve(); await checked; expect(context.scope.state).toBe("disposed");
  });
  it("admits an accepted sync attempt before an immediate stop and drains it", async () => {
    const finish = deferred(); let entered = false;
    @Job({ id: "attempt.immediate-stop" }) class Test { constructor(_context: BunJobContext) {} async handle(): Promise<void> { entered = true; await finish.promise; } }
    const { app, manager } = await start(Test);
    const dispatched = manager.job(Test).dispatch(); const caught = dispatched.catch((error: unknown) => error);
    const stopped = app.stop(); await Promise.resolve(); await Promise.resolve();
    try { expect(entered).toBe(true); } finally { finish.resolve(); await stopped; }
    expect(await caught).toMatchObject({ job: "attempt.immediate-stop" });
  });
  it("binds the frozen exact context before Provider boot/DI and uses a fresh scope per execution", async () => {
    const contexts: BunJobContext[] = [];
    @Job({ id: "attempt.context" }) class Test { constructor(private readonly context: BunJobContext) {} handle(): void { expect(this.context).toBe(bootContext); contexts.push(this.context); } }
    const { manager } = await start(Test, undefined, Setup);
    await manager.job(Test).dispatch(); await manager.job(Test).dispatch();
    expect(Object.isFrozen(contexts[0])).toBe(true); expect(contexts[0]!.envelope.attempts).toBe(1);
    expect(contexts[0]!.scope).not.toBe(contexts[1]!.scope); expect(contexts[0]!.scope.kind).toBe("queue-job");
    expect(contexts[0]!.signal.aborted).toBe(false); expect(contexts[0]!.scope.state).toBe("disposed");
  });
  it("aborts cooperatively but waits for an ignoring handler before disposal and sync rejection", async () => {
    vi.useFakeTimers(); const entered = deferred(); const finish = deferred(); const resource = createToken<object>("attempt.resource");
    let context!: BunJobContext; let disposed = false; let settled = false;
    @Job({ id: "attempt.ignored" }) class Test {
      constructor(value: BunJobContext) { context = value; }
      async handle(): Promise<void> { context.scope.value(resource, {}, { dispose() { disposed = true; } }); entered.resolve(); await finish.promise; }
    }
    const { manager } = await start(Test, 10); const pending = manager.job(Test).dispatch();
    const checked = expect(pending).rejects.toThrow(/cooperative timeout/); void pending.then(() => { settled = true; }, () => { settled = true; });
    await entered.promise; await vi.advanceTimersByTimeAsync(15);
    expect(context.signal.aborted).toBe(true); expect(disposed).toBe(false); expect(settled).toBe(false);
    finish.resolve(); await checked; expect(disposed).toBe(true); expect(await manager.listFailed()).toEqual([]);
  });
  it("preserves handler, cancellation and cleanup failures without retrying sync dispatch", async () => {
    vi.useFakeTimers(); const entered = deferred(); const finish = deferred(); const handler = new Error("handler"); const cleanup = new Error("cleanup"); const resource = createToken<object>("attempt.cleanup"); let calls = 0;
    @Job({ id: "attempt.errors" }) class Test {
      constructor(private readonly context: BunJobContext) {}
      async handle(): Promise<void> { calls++; this.context.scope.value(resource, {}, { dispose() { throw cleanup; } }); entered.resolve(); await finish.promise; throw handler; }
    }
    const { manager } = await start(Test, 10); const pending = manager.job(Test).dispatch(); const caught = pending.catch((error: unknown) => error);
    await entered.promise; await vi.advanceTimersByTimeAsync(15); finish.resolve();
    const error = await caught as AggregateError; expect(error.errors[1]).toBe(cleanup);
    expect((error.errors[0] as AggregateError).errors[0]).toBe(handler); expect((error.errors[0] as AggregateError).errors[1]).toMatchObject({ message: expect.stringContaining("cooperative timeout") });
    expect(calls).toBe(1); expect(await manager.listFailed()).toEqual([]);
  });
  it("detects synchronous overruns even when the abort timer cannot run", async () => {
    @Job({ id: "attempt.sync-timeout" }) class Test {
      constructor(_context: BunJobContext) {}
      handle(): void { const until = performance.now() + 10; while (performance.now() < until) { /* deliberately block the timer */ } }
    }
    const { manager } = await start(Test, 1); await expect(manager.job(Test).dispatch()).rejects.toThrow(/cooperative timeout/);
  });
});
