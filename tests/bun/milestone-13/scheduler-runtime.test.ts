import { afterEach, describe, expect, it, vi } from "vitest";
import { defineApp, defineManagedMethodPlan, defineRuntimeRegistry, defineRuntimeSchedule, getManagedClassMetadata, type Application } from "@bunwire/core";
import { BUN_JOB_CONTEXT, BUN_JOB_HANDLE_KIND, BUN_JOB_KIND, BUN_QUEUE_WORKER, BUN_SCHEDULE_CONTEXT, BUN_SCHEDULED_TASK_HANDLE_KIND, BUN_SCHEDULED_TASK_KIND, BUN_SCHEDULER, BunAdapter, Job, MemoryScheduleLockProvider, Schedule, SyncQueueDriver, cronMatches, parseCronExpression, type BunJobContext, type BunScheduledTaskContext, type BunSchedulerClock, type ScheduleExecutionOutcome, type ScheduleLockLease, type ScheduleLockProvider, type ScheduleLockRequest } from "@bunwire/bun";

class Clock implements BunSchedulerClock {
  value = Date.UTC(2026, 0, 1, 4, 0); readonly waiting = new Set<{ at: number; resolve(): void; reject(error: unknown): void; signal: AbortSignal }>();
  now(): number { return this.value; }
  waitUntil(at: number, signal: AbortSignal): Promise<void> { return new Promise((resolve, reject) => { const item = { at, resolve, reject, signal }; this.waiting.add(item); signal.addEventListener("abort", () => { this.waiting.delete(item); reject(signal.reason); }, { once: true }); }); }
  advance(milliseconds: number): void { this.value += milliseconds; for (const item of [...this.waiting]) if (item.at <= this.value) { this.waiting.delete(item); item.resolve(); } }
}
class TestLocks implements ScheduleLockProvider {
  readonly capabilities = Object.freeze({ distributed: true }); readonly outcomes: ScheduleExecutionOutcome[] = []; readonly requests: ScheduleLockRequest[] = []; readonly releasedModes: string[] = []; initialized = 0; renewed = 0; closed = 0;
  constructor(private readonly failInitialize = false) {}
  initialize(): void { this.initialized++; if (this.failInitialize) throw new Error("lock init"); }
  acquire(request: ScheduleLockRequest): ScheduleLockLease { this.requests.push(request); return Object.freeze({ ...request, token: crypto.randomUUID(), expiresAt: Date.now() + request.leaseMilliseconds }); }
  renew(lease: ScheduleLockLease, leaseMilliseconds: number): ScheduleLockLease { this.renewed++; return Object.freeze({ ...lease, expiresAt: Date.now() + leaseMilliseconds }); }
  release(lease: ScheduleLockLease, outcome: ScheduleExecutionOutcome): void { this.releasedModes.push(lease.mode); this.outcomes.push(outcome); }
  close(): void { this.closed++; }
}
const apps: Application[] = []; afterEach(async () => { await Promise.allSettled(apps.splice(0).map((app) => app.stop())); vi.restoreAllMocks(); });
function registry(target: new (...args: any[]) => { handle(): unknown }, schedules: ReturnType<typeof defineRuntimeSchedule>[]) {
  return defineRuntimeRegistry({ classes: [{ target, kind: BUN_SCHEDULED_TASK_KIND, scope: "transient", dependencies: [{ index: 0, token: BUN_SCHEDULE_CONTEXT }], data: getManagedClassMetadata(target)!.data }],
    methods: [defineManagedMethodPlan({ target, kind: BUN_SCHEDULED_TASK_HANDLE_KIND, ownerKind: BUN_SCHEDULED_TASK_KIND, method: "handle", data: undefined, parameters: [] })], schedules });
}
async function start(target: new (...args: any[]) => { handle(): unknown }, cron: string, options: { clock?: Clock; onError?: (value: unknown) => void; failurePolicy?: "continue" | "stop" } = {}) {
  const clock = options.clock ?? new Clock(); const definition = defineRuntimeSchedule({ id: "test.task", target, execution: "direct", cron, timezone: "UTC", overlap: "allow", lockFor: 100 });
  const app = defineApp().withAdapter(new BunAdapter({ role: "scheduler", handleSignals: false, scheduler: { clock, ...(options.onError ? { onError: ({ error }) => options.onError!(error) } : {}), ...(options.failurePolicy ? { failurePolicy: options.failurePolicy } : {}) } })).withRuntimeRegistry(registry(target, [definition])); apps.push(app); await app.start(); return { app, clock, scheduler: app.rootContainer.get(BUN_SCHEDULER), definition };
}

describe("Bun scheduler runtime", () => {
  it("validates scheduler-only adapter options deterministically", () => {
    expect(() => new BunAdapter({ role: "http", scheduler: {} })).toThrow(/scheduler or command runtime role/);
    expect(() => new BunAdapter({ role: "scheduler", scheduler: { timezone: "Not/A_Zone" } })).toThrow(/Unknown IANA timezone/);
    expect(() => new BunAdapter({ role: "scheduler", scheduler: { lockLeaseMilliseconds: 0 } })).toThrow(/positive safe integer/);
    expect(() => new BunAdapter({ role: "scheduler", scheduler: { failurePolicy: "invalid" as "stop" } })).toThrow(/continue or stop/);
  });
  it("runs a due task once at startup with fresh frozen context/scope and skips non-due work", async () => {
    const contexts: BunScheduledTaskContext[] = []; @Schedule() class Task { constructor(private readonly context: BunScheduledTaskContext) {} handle(): void { contexts.push(this.context); } }
    const running = await start(Task, "0 4 * * *"); await vi.waitFor(() => expect(contexts).toHaveLength(1));
    expect(() => running.app.rootContainer.get(BUN_QUEUE_WORKER)).toThrow();
    expect(Object.isFrozen(contexts[0])).toBe(true); expect(contexts[0]!.scope.kind).toBe("scheduled-task"); expect(contexts[0]!.scope.state).toBe("disposed"); expect(contexts[0]!.scheduledAt).toBe(Date.UTC(2026, 0, 1, 4, 0));
    running.clock.advance(30_000); await Promise.resolve(); expect(contexts).toHaveLength(1);
    @Schedule() class NotDue { constructor(_context: BunScheduledTaskContext) {} handle(): never { throw new Error("not due"); } }
    const later = await start(NotDue, "1 4 * * *"); await new Promise((resolve) => setTimeout(resolve, 10)); expect(later.scheduler.activeCount).toBe(0);
  });
  it("does not start scheduler work for the command runtime role", async () => {
    let calls = 0; @Schedule() class Task { constructor(_context: BunScheduledTaskContext) {} handle(): void { calls++; } }
    const definition = defineRuntimeSchedule({ id: "ignored", target: Task, execution: "direct", cron: "* * * * *", overlap: "allow" });
    const app = defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false })).withRuntimeRegistry(registry(Task, [definition])); apps.push(app); await app.start();
    await new Promise((resolve) => setTimeout(resolve, 10)); expect(calls).toBe(0); expect(app.rootContainer.get(BUN_SCHEDULER).state).toBe("idle");
  });
  it("skips missed minutes and keeps later ticks healthy after a reported task failure", async () => {
    const calls: number[] = []; const errors: unknown[] = []; let fail = true;
    @Schedule() class Task { constructor(private readonly context: BunScheduledTaskContext) {} handle(): void { calls.push(this.context.scheduledAt); if (fail) { fail = false; throw new Error("scheduled failure"); } } }
    const running = await start(Task, "* * * * *", { onError: (error) => errors.push(error) }); await vi.waitFor(() => expect(errors).toHaveLength(1));
    running.clock.advance(5 * 60_000); await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toBe(Date.UTC(2026, 0, 1, 4, 5)); expect(running.scheduler.state).toBe("running");
  });
  it("reports user failures through the deterministic console fallback by default", async () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    @Schedule() class Task { constructor(_context: BunScheduledTaskContext) {} handle(): never { throw new Error("default report"); } }
    const running = await start(Task, "* * * * *"); await vi.waitFor(() => expect(report).toHaveBeenCalledWith('Bunwire scheduled work "test.task" failed.', expect.objectContaining({ message: "default report" })));
    expect(running.scheduler.state).toBe("running");
  });
  it("turns configured user failure into failed Core shutdown and stops new ticks gracefully", async () => {
    @Schedule() class Task { constructor(_context: BunScheduledTaskContext) {} handle(): never { throw new Error("stop policy"); } }
    const running = await start(Task, "* * * * *", { onError: () => undefined, failurePolicy: "stop" });
    await vi.waitFor(() => expect(running.app.state).toBe("failed")); await expect(running.scheduler.done).rejects.toThrow("stop policy");
  });
  it("dispatches generated jobs with static arguments through the existing queue runtime", async () => {
    const calls: { value: string; context: BunJobContext }[] = []; const clock = new Clock(); const payload = { value: "static" };
    @Job({ id: "schedule.job" }) class Work { constructor(private readonly context: BunJobContext) {} handle(input: { value: string }): void { calls.push({ value: input.value, context: this.context }); } }
    const schedule = defineRuntimeSchedule({ id: "job", target: Work, execution: "job", arguments: [payload], cron: "* * * * *", timezone: "UTC", overlap: "allow", lockFor: 100 });
    const app = defineApp().withAdapter(new BunAdapter({ role: "scheduler", handleSignals: false, queues: { driver: new SyncQueueDriver() }, scheduler: { clock } })).withRuntimeRegistry(defineRuntimeRegistry({
      classes: [{ target: Work, kind: BUN_JOB_KIND, scope: "transient", dependencies: [{ index: 0, token: BUN_JOB_CONTEXT }], data: { id: "schedule.job", queue: "default", tries: 1, backoff: [] } }],
      methods: [defineManagedMethodPlan({ target: Work, kind: BUN_JOB_HANDLE_KIND, ownerKind: BUN_JOB_KIND, method: "handle", data: undefined, parameters: [{ source: "transport", methodIndex: 0, argumentIndex: 0, optional: false, rest: false }] })], schedules: [schedule],
    })); apps.push(app); await app.start(); payload.value = "mutated"; await vi.waitFor(() => expect(calls).toHaveLength(1)); expect(calls[0]!.value).toBe("static"); expect(calls[0]!.context.scope.kind).toBe("queue-job");
  });
  it("holds overlap locks across active work and graceful stop waits for settlement", async () => {
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); let calls = 0;
    @Schedule() class Task { constructor(_context: BunScheduledTaskContext) {} async handle(): Promise<void> { calls++; await gate; } }
    const clock = new Clock(); const definition = defineRuntimeSchedule({ id: "locked", target: Task, execution: "direct", cron: "* * * * *", timezone: "UTC", overlap: "without-overlap", lockFor: 120_000 });
    const app = defineApp().withAdapter(new BunAdapter({ role: "scheduler", handleSignals: false, scheduler: { clock } })).withRuntimeRegistry(registry(Task, [definition])); apps.push(app); await app.start(); await vi.waitFor(() => expect(calls).toBe(1));
    clock.advance(60_000); await new Promise((resolve) => setTimeout(resolve, 10)); expect(calls).toBe(1); const stopping = app.stop(); let stopped = false; void stopping.then(() => { stopped = true; }); await Promise.resolve(); expect(stopped).toBe(false); release(); await stopping; expect(app.state).toBe("stopped");
  });
  it("rejects single-server declarations without a distributed-capable provider", async () => {
    @Schedule() class Task { constructor(_context: BunScheduledTaskContext) {} handle(): void {} }
    const definition = defineRuntimeSchedule({ id: "single", target: Task, execution: "direct", cron: "* * * * *", timezone: "UTC", overlap: "single-server", lockFor: 100 });
    const app = defineApp().withAdapter(new BunAdapter({ role: "scheduler", handleSignals: false, scheduler: { clock: new Clock() } })).withRuntimeRegistry(registry(Task, [definition])); apps.push(app); await expect(app.start()).rejects.toThrow(/distributed lock/); expect(app.state).toBe("failed");
  });
  it("rejects ambiguous generated direct-task handle plans", async () => {
    @Schedule() class Task { constructor(_context: BunScheduledTaskContext) {} handle(): void {} }
    const plan = defineManagedMethodPlan({ target: Task, kind: BUN_SCHEDULED_TASK_HANDLE_KIND, ownerKind: BUN_SCHEDULED_TASK_KIND, method: "handle", data: undefined, parameters: [] });
    const definition = defineRuntimeSchedule({ id: "ambiguous", target: Task, execution: "direct", cron: "* * * * *", overlap: "allow" });
    const app = defineApp().withAdapter(new BunAdapter({ role: "scheduler", handleSignals: false, scheduler: { clock: new Clock() } })).withRuntimeRegistry(defineRuntimeRegistry({
      classes: [{ target: Task, kind: BUN_SCHEDULED_TASK_KIND, scope: "transient", dependencies: [{ index: 0, token: BUN_SCHEDULE_CONTEXT }], data: getManagedClassMetadata(Task)!.data }], methods: [plan, plan], schedules: [definition],
    })); apps.push(app); await expect(app.start()).rejects.toThrow(/duplicate managed method identity/);
  });
  it("uses the adapter timezone when a generated schedule has no explicit timezone", async () => {
    const calls: BunScheduledTaskContext[] = []; const clock = new Clock();
    @Schedule() class Task { constructor(private readonly context: BunScheduledTaskContext) {} handle(): void { calls.push(this.context); } }
    const definition = defineRuntimeSchedule({ id: "default-zone", target: Task, execution: "direct", cron: "0 5 * * *", overlap: "allow", lockFor: 100 });
    const app = defineApp().withAdapter(new BunAdapter({ role: "scheduler", handleSignals: false, scheduler: { clock, timezone: "Africa/Lagos" } })).withRuntimeRegistry(registry(Task, [definition])); apps.push(app);
    await app.start(); await vi.waitFor(() => expect(calls).toHaveLength(1)); expect(calls[0]!.timezone).toBe("Africa/Lagos"); expect(calls[0]!.definition.timezone).toBe("Africa/Lagos");
  });
  it("reports lock release outcomes and closes an initialized provider exactly once", async () => {
    const successLocks = new TestLocks(); @Schedule() class Success { constructor(_context: BunScheduledTaskContext) {} handle(): void {} }
    const successDefinition = defineRuntimeSchedule({ id: "success", target: Success, execution: "direct", cron: "* * * * *", overlap: "without-overlap-single-server" });
    const successApp = defineApp().withAdapter(new BunAdapter({ role: "scheduler", handleSignals: false, scheduler: { clock: new Clock(), locks: successLocks, lockLeaseMilliseconds: 444 } })).withRuntimeRegistry(registry(Success, [successDefinition])); apps.push(successApp);
    await successApp.start(); await vi.waitFor(() => expect(successLocks.outcomes).toEqual(["success", "success"])); expect(successLocks.requests.map((request) => request.mode)).toEqual(["overlap", "single-server"]); expect(successLocks.releasedModes).toEqual(["single-server", "overlap"]); expect(successLocks.requests.every((request) => request.leaseMilliseconds === 444)).toBe(true); await successApp.stop(); await successApp.stop(); expect(successLocks.closed).toBe(1);

    const failureLocks = new TestLocks(); @Schedule() class Failure { constructor(_context: BunScheduledTaskContext) {} handle(): never { throw new Error("work failed"); } }
    const failureDefinition = defineRuntimeSchedule({ id: "failure", target: Failure, execution: "direct", cron: "* * * * *", overlap: "without-overlap", lockFor: 100 });
    const failureApp = defineApp().withAdapter(new BunAdapter({ role: "scheduler", handleSignals: false, scheduler: { clock: new Clock(), locks: failureLocks, onError: () => undefined } })).withRuntimeRegistry(registry(Failure, [failureDefinition])); apps.push(failureApp);
    await failureApp.start(); await vi.waitFor(() => expect(failureLocks.outcomes).toEqual(["failure"]));
  });
  it("renews leases while scheduled work remains active", async () => {
    const locks = new TestLocks(); @Schedule() class Task { constructor(_context: BunScheduledTaskContext) {} async handle(): Promise<void> { await new Promise((resolve) => setTimeout(resolve, 60)); } }
    const definition = defineRuntimeSchedule({ id: "renew", target: Task, execution: "direct", cron: "* * * * *", overlap: "without-overlap", lockFor: 30 });
    const app = defineApp().withAdapter(new BunAdapter({ role: "scheduler", handleSignals: false, scheduler: { clock: new Clock(), locks } })).withRuntimeRegistry(registry(Task, [definition])); apps.push(app);
    await app.start(); await vi.waitFor(() => expect(locks.outcomes).toEqual(["success"])); expect(locks.renewed).toBeGreaterThan(0);
  });
  it("rolls back a failed lock-provider initialization and forbids provider sharing", async () => {
    @Schedule() class Task { constructor(_context: BunScheduledTaskContext) {} handle(): void {} }
    const definition = defineRuntimeSchedule({ id: "ownership", target: Task, execution: "direct", cron: "1 1 * * *", overlap: "allow", lockFor: 100 });
    const failedLocks = new TestLocks(true); const failed = defineApp().withAdapter(new BunAdapter({ role: "scheduler", handleSignals: false, scheduler: { clock: new Clock(), locks: failedLocks } })).withRuntimeRegistry(registry(Task, [definition])); apps.push(failed);
    await expect(failed.start()).rejects.toThrow("lock init"); expect(failedLocks.initialized).toBe(1); expect(failedLocks.closed).toBe(1);

    const shared = new TestLocks(); const first = defineApp().withAdapter(new BunAdapter({ role: "scheduler", handleSignals: false, scheduler: { clock: new Clock(), locks: shared } })).withRuntimeRegistry(registry(Task, [definition])); apps.push(first); await first.start();
    const second = defineApp().withAdapter(new BunAdapter({ role: "scheduler", handleSignals: false, scheduler: { clock: new Clock(), locks: shared } })).withRuntimeRegistry(registry(Task, [definition])); apps.push(second); await expect(second.start()).rejects.toThrow(/cannot be shared/); expect(shared.initialized).toBe(1);
  });
});

describe("cron and local lock contracts", () => {
  it("parses standard lists, ranges, steps, names and timezone-local values", () => {
    const cron = parseCronExpression("*/15 9-17 * JAN,MAR MON-FRI"); expect(Object.isFrozen(cron)).toBe(true);
    expect(cronMatches(cron, Date.UTC(2026, 0, 5, 9, 15), "UTC")).toBe(true); expect(cronMatches(cron, Date.UTC(2026, 0, 5, 9, 16), "UTC")).toBe(false);
    expect(cronMatches(parseCronExpression("0 4 * * *"), Date.UTC(2026, 0, 1, 3, 0), "Africa/Lagos")).toBe(true);
    const fallback = parseCronExpression("30 1 * * *"); expect(cronMatches(fallback, Date.UTC(2026, 10, 1, 5, 30), "America/New_York")).toBe(true); expect(cronMatches(fallback, Date.UTC(2026, 10, 1, 6, 30), "America/New_York")).toBe(true);
    for (const invalid of ["* * * *", "60 * * * *", "* * * * FUNDAY", "*/0 * * * *"]) expect(() => parseCronExpression(invalid)).toThrow();
  });
  it("fences, renews, releases and recovers expired memory locks", () => {
    let now = 0; const locks = new MemoryScheduleLockProvider(() => now); locks.initialize(); const request = { key: "task", mode: "overlap" as const, owner: "one", leaseMilliseconds: 10, scheduledAt: 0 };
    const first = locks.acquire(request)!; expect(locks.acquire({ ...request, owner: "two" })).toBeUndefined(); now = 5; const renewed = locks.renew(first, 20); expect(renewed.token).toBe(first.token); expect(renewed.expiresAt).toBe(25);
    expect(() => locks.release(first, "success")).toThrow(/stale/); locks.release(renewed, "failure"); expect(locks.acquire({ ...request, owner: "two" })).toBeDefined(); locks.close();
  });
});
