import { createToken, type Application } from "@bunwire/core";
import { BunQueueError, queueInteger, queueName } from "./jobs.js";
import { BunJobFatalError, InvalidJobError } from "./job-context.js";
import { failedJobError, type FailedJobReason, type FailedJobStore } from "./failed-jobs.js";
import type { QueueDriver, QueueEnvelope, QueueReservation } from "./queue-driver.js";

export interface BunQueueWorkerOptions {
  readonly queues?: readonly string[];
  readonly concurrency?: number;
  readonly pollIntervalMs?: number;
  readonly leaseDurationMs?: number;
}
export type QueueWorkerState = "idle" | "starting" | "running" | "stopping" | "stopped" | "failed";
export const BUN_QUEUE_WORKER = createToken<QueueWorker>("bun.queue-worker");

export function workerOptions(input: BunQueueWorkerOptions = {}): Required<BunQueueWorkerOptions> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new BunQueueError("Queue worker options must be an object.");
  const names = input.queues === undefined ? ["default"] : input.queues;
  if (!Array.isArray(names) || !names.length) throw new BunQueueError("Worker queues must be a non-empty array.");
  const queues = Array.from(names, queueName);
  if (new Set(queues).size !== queues.length) throw new BunQueueError("Worker queues must be unique.");
  return Object.freeze({ queues: Object.freeze(queues), concurrency: queueInteger(input.concurrency === undefined ? 1 : input.concurrency, "Worker concurrency", 1),
    pollIntervalMs: queueInteger(input.pollIntervalMs === undefined ? 250 : input.pollIntervalMs, "Worker poll interval", 1),
    leaseDurationMs: queueInteger(input.leaseDurationMs === undefined ? 30_000 : input.leaseDurationMs, "Worker lease duration", 1) });
}
export function assertWorkerDriver(driver: QueueDriver | undefined): asserts driver is QueueDriver {
  if (!driver || !driver.capabilities.reservations || !driver.capabilities.delay || driver.capabilities.renewal !== true || typeof driver.renew !== "function") {
    throw new BunQueueError("The worker role requires an explicit QueueDriver supporting reservations, delay and renewal.");
  }
}

function terminalReason(error: unknown, envelope: QueueEnvelope): FailedJobReason | undefined {
  const seen = new Set<unknown>();
  function includes(type: typeof BunJobFatalError, value: unknown): boolean {
    if (seen.has(value)) return false;
    seen.add(value);
    return value instanceof type || (value instanceof AggregateError && value.errors.some((nested) => includes(type, nested)));
  }
  if (includes(InvalidJobError, error)) return "invalid";
  seen.clear();
  if (includes(BunJobFatalError, error)) return "fatal";
  return envelope.attempts >= envelope.policy.tries ? "exhausted" : undefined;
}

/** Adapter-owned consumer. Infrastructure errors stop consumption and request Core shutdown. */
export class QueueWorker {
  readonly options: Required<BunQueueWorkerOptions>;
  readonly done: Promise<void>;
  readonly #active = new Set<Promise<void>>();
  readonly #failures: unknown[] = [];
  #resolve!: () => void;
  #reject!: (error: unknown) => void;
  #state: QueueWorkerState = "idle";
  #closing = false;
  #startup: ReturnType<typeof setTimeout> | undefined;
  #wake: (() => void) | undefined;
  #queueIndex = 0;

  constructor(private readonly application: Application, private readonly driver: QueueDriver, private readonly failedJobs: FailedJobStore,
    private readonly execute: (envelope: QueueEnvelope, cancellation: AbortController) => Promise<void>, options?: BunQueueWorkerOptions) {
    assertWorkerDriver(driver); this.options = workerOptions(options);
    this.done = new Promise<void>((resolve, reject) => { this.#resolve = resolve; this.#reject = reject; });
    // Applications may only observe app.stop(); still keep done's rejection available to entrypoints.
    void this.done.catch(() => undefined);
  }
  get state(): QueueWorkerState { return this.#state; }
  get activeCount(): number { return this.#active.size; }

  /** Called at host start; reserve cannot happen before Core reaches running. */
  start(): void {
    if (this.#state !== "idle") throw new BunQueueError("Queue worker can only start once.");
    this.#state = "starting";
    this.#startup = setTimeout(() => {
      this.#startup = undefined;
      if (this.application.state !== "running" || this.#closing) { this.#closing = true; this.#finish(); return; }
      this.#state = "running";
      void this.#consume();
    }, 0);
  }
  stop(): Promise<void> {
    if (!this.#closing) {
      this.#closing = true;
      if (this.#state === "idle" || this.#startup !== undefined) {
        if (this.#startup !== undefined) clearTimeout(this.#startup);
        this.#startup = undefined; this.#finish();
      } else if (this.#state !== "failed" && this.#state !== "stopped") this.#state = "stopping";
      this.#wake?.();
    }
    return this.done;
  }
  #fault(error: unknown): void {
    if (!this.#failures.includes(error)) this.#failures.push(error);
    this.#closing = true; this.#state = "failed"; this.#wake?.();
    // Never await Core stop here: its adapter cleanup waits for this worker's active attempts.
    void this.application.stop().catch(() => undefined);
  }
  #finish(): void {
    if (!this.#failures.length) { this.#state = "stopped"; this.#resolve(); }
    else {
      this.#state = "failed";
      this.#reject(this.#failures.length === 1 ? this.#failures[0] : new AggregateError(this.#failures, "Queue worker infrastructure failed."));
    }
  }
  #wait(milliseconds?: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = milliseconds === undefined ? undefined : setTimeout(wake, milliseconds);
      const self = this;
      function wake(): void { if (timer !== undefined) clearTimeout(timer); self.#wake = undefined; resolve(); }
      this.#wake = wake;
      if (this.#closing) wake();
    });
  }
  async #consume(): Promise<void> {
    let emptyQueues = 0;
    try {
      while (!this.#closing) {
        if (this.#active.size >= this.options.concurrency) { await this.#wait(); continue; }
        const queue = this.options.queues[this.#queueIndex++ % this.options.queues.length]!;
        const reservation = await this.driver.reserve(queue, this.options.leaseDurationMs);
        if (!reservation) {
          if (++emptyQueues >= this.options.queues.length) { emptyQueues = 0; await this.#wait(this.options.pollIntervalMs); }
          continue;
        }
        if (this.#closing || this.application.state !== "running") { await this.driver.release(reservation); break; }
        emptyQueues = 0;
        const attempt = this.#attempt(reservation).catch((error: unknown) => this.#fault(error));
        this.#active.add(attempt);
        void attempt.then(() => { this.#active.delete(attempt); this.#wake?.(); });
      }
    } catch (error) { this.#fault(error); }
    finally { await Promise.all([...this.#active]); this.#finish(); }
  }
  async #attempt(initial: QueueReservation): Promise<void> {
    let reservation = initial;
    const cancellation = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let renewing: Promise<void> | undefined;
    let quiesced = false;
    let lost = false;
    let leaseError: unknown;
    const schedule = (): void => {
      timer = setTimeout(() => {
        renewing = (async () => {
          try {
            const renewed = await this.driver.renew!(reservation, this.options.leaseDurationMs);
            if (!renewed || renewed.lease !== initial.lease || renewed.envelope.id !== initial.envelope.id
              || renewed.envelope.attempts !== initial.envelope.attempts || !Number.isSafeInteger(renewed.expiresAt) || renewed.expiresAt <= Date.now()) {
              throw new BunQueueError("Queue driver returned an invalid renewed reservation.");
            }
            reservation = renewed;
          } catch (error) {
            lost = true; leaseError = error; cancellation.abort(error); this.#fault(error);
          }
          if (!quiesced && !lost) schedule();
        })();
      }, Math.max(1, Math.floor(this.options.leaseDurationMs / 3)));
    };
    const quiesce = async (): Promise<void> => {
      quiesced = true; if (timer !== undefined) clearTimeout(timer); await renewing;
    };
    schedule();
    let failed = false; let error: unknown;
    try {
      try { await this.execute(initial.envelope, cancellation); }
      catch (failure) { failed = true; error = failure; }
      if (lost) throw leaseError;
      const reason = failed ? terminalReason(error, initial.envelope) : undefined;
      if (reason) {
        // Persist while renewal is still active. On persistence failure do not remove queued work.
        await this.failedJobs.save(Object.freeze({ envelope: initial.envelope, failedAt: Date.now(), reason, error: failedJobError(error) }));
      }
      await quiesce();
      if (lost) throw leaseError;
      if (!failed) await this.driver.acknowledge(reservation);
      else if (reason) await this.driver.fail(reservation, error);
      else {
        const backoff = initial.envelope.policy.backoff;
        const delay = backoff.length ? backoff[Math.min(initial.envelope.attempts - 1, backoff.length - 1)]! : 0;
        await this.driver.release(reservation, delay);
      }
    } finally { await quiesce(); }
  }
}
