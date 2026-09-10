import { createToken, type Application, type ManagedMethodPlan, type RuntimeRegistry, type RuntimeScheduleDefinition } from "@bunwire/core";
import { BunScheduleError, cronMatches, parseCronExpression, validateTimeZone, type BunCronExpression } from "./cron.js";
import { BUN_SCHEDULE_CONTEXT } from "./schedule-context.js";
import { BUN_SCHEDULED_TASK_HANDLE_KIND, BUN_SCHEDULED_TASK_KIND } from "./scheduled-tasks.js";
import { BUN_JOB_KIND } from "./jobs.js";
import { JsonJobSerializer } from "./job-serializer.js";
import type { BunExecutionScopeManager } from "./execution-scopes.js";
import type { QueueManager } from "./queue-manager.js";
import { MemoryScheduleLockProvider, type ScheduleExecutionOutcome, type ScheduleLockLease, type ScheduleLockProvider } from "./schedule-lock.js";

export interface BunSchedulerClock { now(): number; waitUntil(timestamp: number, signal: AbortSignal): Promise<void> }
export interface BunSchedulerErrorContext { readonly error: unknown; readonly definition: RuntimeScheduleDefinition; readonly scheduledAt: number }
export interface BunSchedulerOptions {
  readonly timezone?: string;
  readonly clock?: BunSchedulerClock;
  readonly locks?: ScheduleLockProvider;
  readonly lockLeaseMilliseconds?: number;
  readonly failurePolicy?: "continue" | "stop";
  readonly onError?: (context: BunSchedulerErrorContext) => void | Promise<void>;
}
export type BunSchedulerState = "idle" | "starting" | "running" | "stopping" | "stopped" | "failed";
export const BUN_SCHEDULER = createToken<BunScheduler>("bun.scheduler");
const SYSTEM_CLOCK: BunSchedulerClock = Object.freeze({ now: Date.now, waitUntil(timestamp: number, signal: AbortSignal) { return new Promise<void>((resolve, reject) => {
  if (signal.aborted) { reject(signal.reason); return; }
  const timer = setTimeout(done, Math.max(0, timestamp - Date.now())); function done() { signal.removeEventListener("abort", abort); resolve(); }
  function abort() { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); } signal.addEventListener("abort", abort, { once: true });
}); } });
export interface NormalizedBunSchedulerOptions { readonly timezone: string; readonly clock: BunSchedulerClock; readonly locks: ScheduleLockProvider; readonly lockLeaseMilliseconds: number; readonly failurePolicy: "continue" | "stop"; readonly onError: BunSchedulerOptions["onError"] }
export function normalizeSchedulerOptions(options: BunSchedulerOptions = {}): NormalizedBunSchedulerOptions {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new BunScheduleError("Scheduler options must be an object.");
  const timezone = validateTimeZone(options.timezone ?? "UTC"); const clock = options.clock ?? SYSTEM_CLOCK; const locks = options.locks ?? new MemoryScheduleLockProvider(() => clock.now());
  const lease = options.lockLeaseMilliseconds ?? 30_000;
  if (!clock || typeof clock.now !== "function" || typeof clock.waitUntil !== "function") throw new BunScheduleError("Scheduler clock must provide now() and waitUntil().");
  if (!locks || typeof locks.initialize !== "function" || typeof locks.acquire !== "function" || typeof locks.renew !== "function" || typeof locks.release !== "function" || typeof locks.close !== "function" || typeof locks.capabilities?.distributed !== "boolean") throw new BunScheduleError("Scheduler locks must implement ScheduleLockProvider.");
  if (!Number.isSafeInteger(lease) || lease < 1) throw new BunScheduleError("Scheduler lock lease must be a positive safe integer.");
  if (options.failurePolicy !== undefined && options.failurePolicy !== "continue" && options.failurePolicy !== "stop") throw new BunScheduleError("Scheduler failurePolicy must be continue or stop.");
  if (options.onError !== undefined && typeof options.onError !== "function") throw new BunScheduleError("Scheduler onError must be callable.");
  return Object.freeze({ timezone, clock, locks, lockLeaseMilliseconds: lease, failurePolicy: options.failurePolicy ?? "continue", onError: options.onError });
}
type ResolvedRuntimeScheduleDefinition = Omit<RuntimeScheduleDefinition, "timezone" | "lockFor"> & { readonly timezone: string; readonly lockFor: number };
interface Entry { readonly definition: ResolvedRuntimeScheduleDefinition; readonly cron: BunCronExpression; readonly plan?: ManagedMethodPlan }
const lockProviderOwners = new WeakSet<object>();
const scheduleArgumentSerializer = new JsonJobSerializer();
function freezeScheduleValue(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeScheduleValue));
  if (value && typeof value === "object") return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, freezeScheduleValue(entry)])));
  return value;
}
export class BunScheduler {
  readonly options: ReturnType<typeof normalizeSchedulerOptions>; readonly done: Promise<void>; readonly #entries: Entry[] = []; readonly #active = new Set<Promise<void>>();
  #state: BunSchedulerState = "idle"; #closing = false; #resolve!: () => void; #reject!: (error: unknown) => void; #controller = new AbortController(); #startup: ReturnType<typeof setTimeout> | undefined; #lastMinute = -Infinity; readonly #failures: unknown[] = []; #initializationAttempted = false; #closed = false;
  constructor(private readonly application: Application, private readonly scopes: BunExecutionScopeManager, private readonly queues: QueueManager, options?: BunSchedulerOptions) {
    this.options = normalizeSchedulerOptions(options); this.done = new Promise<void>((resolve, reject) => { this.#resolve = resolve; this.#reject = reject; }); void this.done.catch(() => undefined);
  }
  get state(): BunSchedulerState { return this.#state; } get activeCount(): number { return this.#active.size; }
  get definitions(): readonly RuntimeScheduleDefinition[] { return Object.freeze(this.#entries.map((entry) => entry.definition)); }
  consume(registry: RuntimeRegistry): void {
    if (this.#state !== "idle") throw new BunScheduleError("Scheduler registry must be consumed before start."); this.#entries.length = 0; const ids = new Set<string>();
    for (const definition of registry.schedules ?? []) {
      if (ids.has(definition.id)) throw new BunScheduleError(`Duplicate schedule identity "${definition.id}".`); ids.add(definition.id);
      const timezone = validateTimeZone(definition.timezone ?? this.options.timezone);
      const arguments_ = definition.execution === "job"
        ? freezeScheduleValue(scheduleArgumentSerializer.deserialize(scheduleArgumentSerializer.serialize(definition.arguments))) as readonly unknown[]
        : definition.arguments;
      const resolvedDefinition: ResolvedRuntimeScheduleDefinition = Object.freeze({ ...definition, arguments: arguments_, timezone, lockFor: definition.lockFor ?? this.options.lockLeaseMilliseconds });
      const owner = registry.classes.find((entry) => entry.target === definition.target); if (!owner) throw new BunScheduleError("Schedule target is absent from the generated class registry.");
      let plan: ManagedMethodPlan | undefined;
      if (definition.execution === "direct") {
        if (owner.kind !== BUN_SCHEDULED_TASK_KIND || owner.scope !== "transient" || definition.arguments.length) throw new BunScheduleError("Direct schedules require canonical transient scheduled tasks without arguments.");
        const plans = registry.methods.filter((entry) => entry.target === definition.target && entry.kind === BUN_SCHEDULED_TASK_HANDLE_KIND);
        plan = plans[0];
        if (plans.length !== 1 || !plan || plan.parameters.length) throw new BunScheduleError("Scheduled task requires one canonical parameterless handle plan.");
      } else { if (owner.kind !== BUN_JOB_KIND) throw new BunScheduleError("Job schedules require canonical generated Job targets."); if (!this.queues.configured) throw new BunScheduleError("Scheduled jobs require an explicit queue driver."); }
      if (resolvedDefinition.overlap.includes("single-server") && !this.options.locks.capabilities.distributed) throw new BunScheduleError(`Schedule "${resolvedDefinition.id}" requires a distributed lock provider.`);
      this.#entries.push(Object.freeze({ definition: resolvedDefinition, cron: parseCronExpression(resolvedDefinition.cron), ...(plan ? { plan } : {}) }));
    }
  }
  async initialize(): Promise<void> {
    if (this.#initializationAttempted) throw new BunScheduleError("Scheduler lock provider initialization was already attempted.");
    if (lockProviderOwners.has(this.options.locks as object)) throw new BunScheduleError("Schedule lock providers cannot be shared between Bun Applications.");
    this.#initializationAttempted = true; lockProviderOwners.add(this.options.locks as object); await this.options.locks.initialize();
  }
  start(): void { if (this.#state !== "idle") throw new BunScheduleError("Scheduler can only start once."); this.#state = "starting"; this.#startup = setTimeout(() => { this.#startup = undefined; if (this.#closing || this.application.state !== "running") this.#finish(); else { this.#state = "running"; void this.#loop(); } }, 0); }
  async runDue(timestamp = this.options.clock.now()): Promise<number> {
    if (!this.#initializationAttempted || this.#closing || this.#state !== "idle" || this.application.state !== "running" || !Number.isFinite(timestamp)) throw new BunScheduleError("One-shot schedule execution requires an initialized, idle scheduler and finite timestamp.");
    const minute = Math.floor(timestamp / 60_000) * 60_000;
    const due = this.#entries.filter((entry) => cronMatches(entry.cron, minute, entry.definition.timezone));
    const failures = this.#failures.length;
    await Promise.all(due.map((entry) => this.#execute(entry, minute)));
    const added = this.#failures.slice(failures);
    if (added.length === 1) throw added[0];
    if (added.length > 1) throw new AggregateError(added, "One-shot schedule execution failed.");
    return due.length;
  }
  stop(): Promise<void> { if (!this.#closing) { const immediate = this.#state === "idle" || this.#startup !== undefined; this.#closing = true; this.#state = this.#state === "failed" ? "failed" : "stopping"; this.#controller.abort(new BunScheduleError("Scheduler stopped.")); if (this.#startup) { clearTimeout(this.#startup); this.#startup = undefined; } if (immediate) this.#finish(); } return this.done; }
  async close(): Promise<void> { if (!this.#initializationAttempted || this.#closed) return; this.#closed = true; await this.options.locks.close(); }
  #fault(error: unknown): void { if (!this.#failures.includes(error)) this.#failures.push(error); this.#state = "failed"; this.#closing = true; this.#controller.abort(error); void this.application.stop().catch(() => undefined); }
  #finish(): void { if (!this.#closing || this.#active.size) return; if (this.#failures.length) this.#reject(this.#failures.length === 1 ? this.#failures[0] : new AggregateError(this.#failures, "Bun scheduler execution or cleanup failed.")); else { this.#state = "stopped"; this.#resolve(); } }
  async #loop(): Promise<void> {
    try {
      while (!this.#closing) {
        const now = this.options.clock.now(); if (!Number.isFinite(now)) throw new BunScheduleError("Scheduler clock returned an invalid time."); const minute = Math.floor(now / 60_000) * 60_000;
        if (minute > this.#lastMinute) { this.#lastMinute = minute; for (const entry of this.#entries) if (cronMatches(entry.cron, minute, entry.definition.timezone)) this.#launch(entry, minute); }
        await this.options.clock.waitUntil(minute + 60_000, this.#controller.signal);
      }
    } catch (error) { if (!this.#closing) this.#fault(error); }
    finally { await Promise.allSettled([...this.#active]); this.#finish(); }
  }
  #launch(entry: Entry, scheduledAt: number): void { const work = this.#execute(entry, scheduledAt); this.#active.add(work); void work.finally(() => { this.#active.delete(work); this.#finish(); }).catch(() => undefined); }
  async #execute(entry: Entry, scheduledAt: number): Promise<void> {
    const leases: ScheduleLockLease[] = []; let outcome: ScheduleExecutionOutcome = "success"; let userError: unknown;
    try {
      for (const mode of ["overlap", "single-server"] as const) {
        if (mode === "overlap" && !entry.definition.overlap.includes("without-overlap")) continue;
        if (mode === "single-server" && !entry.definition.overlap.includes("single-server")) continue;
        const key = mode === "overlap" ? `schedule:${entry.definition.id}` : `schedule:${entry.definition.id}:${scheduledAt}`;
        const lease = await this.options.locks.acquire(Object.freeze({ key, mode, owner: crypto.randomUUID(), leaseMilliseconds: entry.definition.lockFor, scheduledAt }));
        if (!lease) return; leases.push(lease);
      }
      let renewalTimer: ReturnType<typeof setTimeout> | undefined; let renewing: Promise<void> | undefined; let renewalsStopped = false;
      const scheduleRenewal = (): void => { renewalTimer = setTimeout(() => { renewing = (async () => {
        try { for (let index = 0; index < leases.length; index++) leases[index] = await this.options.locks.renew(leases[index]!, entry.definition.lockFor); }
        catch (error) { renewalsStopped = true; this.#fault(error); }
        if (!renewalsStopped) scheduleRenewal();
      })(); }, Math.max(1, Math.floor(entry.definition.lockFor / 3))); };
      if (leases.length) scheduleRenewal();
      try {
        if (entry.definition.execution === "job") await this.queues.job(entry.definition.target, ...entry.definition.arguments).dispatch();
        else await this.scopes.run("scheduled-task", async (scope) => {
          scope.value(BUN_SCHEDULE_CONTEXT, Object.freeze({ definition: entry.definition, scheduledAt, startedAt: this.options.clock.now(), timezone: entry.definition.timezone, scope }));
          await this.application.invokeManagedMethod(entry.plan!, [], { parentContainer: scope.container });
        });
      } catch (error) { userError = error; outcome = "failure"; }
      finally { renewalsStopped = true; if (renewalTimer) clearTimeout(renewalTimer); await renewing; }
      if (userError !== undefined) {
        const context = Object.freeze({ error: userError, definition: entry.definition, scheduledAt });
        try {
          if (this.options.onError) await this.options.onError(context); else console.error(`Bunwire scheduled work "${entry.definition.id}" failed.`, userError);
        } catch (reportingError) {
          throw new AggregateError([userError, reportingError], `Scheduled work "${entry.definition.id}" and its failure reporter both failed.`);
        }
        if (this.options.failurePolicy === "stop") this.#fault(userError);
      }
    } catch (error) { outcome = "failure"; this.#fault(error); }
    finally { for (const lease of leases.reverse()) { try { await this.options.locks.release(lease, outcome); } catch (error) { this.#fault(error); } } }
  }
}
