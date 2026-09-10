import { createToken, defineManagedClassAttachment, getManagedClassMetadata, LISTENER_KIND, type ListenerDefinition, type Application, type ManagedMethodPlan, type RuntimeRegistry } from "@bunwire/core";
import { BunExecutionScopeManager } from "./execution-scopes.js";
import { BUN_JOB_HANDLE_KIND, BUN_JOB_KIND, Job, BunQueueError, compiledJobDefinition, jobPolicy, queueInteger, queueName,
  type BunJobDefinition, type JobArguments, type JobConstructor } from "./jobs.js";
import { JsonJobSerializer, type JobSerializer } from "./job-serializer.js";
import { snapshotEnvelope, type QueueDriver, type QueueEnvelope } from "./queue-driver.js";
import { MemoryFailedJobStore, failedJobError, type FailedJobStore, type FailedJobRecord } from "./failed-jobs.js";
import { BUN_JOB_CONTEXT, InvalidJobError } from "./job-context.js";
import { QueueWorker, workerOptions, assertWorkerDriver, type BunQueueWorkerOptions } from "./queue-worker.js";
import { Queue } from "./queued-listeners.js";
import { snapshotEventCodecs, requireSynchronousCodecResult, type QueueEventCodec } from "./queue-event-codec.js";

export interface BunQueueOptions { readonly driver: QueueDriver; readonly serializer?: JobSerializer; readonly failedJobs?: FailedJobStore; readonly worker?: BunQueueWorkerOptions; readonly eventCodecs?: readonly QueueEventCodec<any, any>[] }
export interface JobDispatchOptions { readonly queue?: string; readonly delay?: number; readonly tries?: number }
export interface JobDispatchReceipt { readonly id: string; readonly job: string; readonly queue: string }
export const BUN_QUEUE_MANAGER = createToken<QueueManager>("bun.queue-manager");
interface RegisteredJob { readonly definition: BunJobDefinition; readonly plan: ManagedMethodPlan; readonly codec?: QueueEventCodec<any, any> }
const driverOwners = new WeakSet<QueueDriver>();
const storeOwners = new WeakSet<FailedJobStore>();

export function validateQueueOptions(options: BunQueueOptions | undefined): void {
  if (options === undefined) return;
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new BunQueueError("Bun queues options must be an object with an explicit driver.");
  const driver = options.driver;
  if (!driver || !["initialize", "push", "reserve", "acknowledge", "release", "fail", "close"].every((key) => typeof driver[key as keyof QueueDriver] === "function")
    || typeof driver.capabilities?.delay !== "boolean" || typeof driver.capabilities.reservations !== "boolean") throw new BunQueueError("Bun queues requires a valid explicit QueueDriver.");
  const serializer = options.serializer;
  if (serializer !== undefined && (!serializer || typeof serializer.serialize !== "function" || typeof serializer.deserialize !== "function"
    || typeof serializer.id !== "string" || !serializer.id || !Number.isSafeInteger(serializer.version) || serializer.version < 1)) throw new BunQueueError("Bun queues serializer must declare id, version, serialize and deserialize.");
  const store = options.failedJobs;
  if (store !== undefined && (!store || !["initialize", "save", "list", "get", "forget", "flush", "close"].every((key) => typeof store[key as keyof FailedJobStore] === "function"))) throw new BunQueueError("Bun queues failedJobs must implement FailedJobStore.");
  if (options.worker !== undefined) workerOptions(options.worker);
  if (options.eventCodecs !== undefined) snapshotEventCodecs(options.eventCodecs);
}

/** Immutable, non-thenable dispatch attachment. Each builder submits at most once. */
export class JobDispatchBuilder {
  #promise: Promise<JobDispatchReceipt> | undefined;
  constructor(private readonly submit: (options: JobDispatchOptions) => Promise<JobDispatchReceipt>, private readonly options: JobDispatchOptions = {}) {
    this.options = Object.freeze({ ...options }); Object.freeze(this);
  }
  onQueue(queue: string): JobDispatchBuilder { return new JobDispatchBuilder(this.submit, { ...this.options, queue: queueName(queue) }); }
  delay(milliseconds: number): JobDispatchBuilder { return new JobDispatchBuilder(this.submit, { ...this.options, delay: queueInteger(milliseconds, "Dispatch delay") }); }
  tries(tries: number): JobDispatchBuilder { return new JobDispatchBuilder(this.submit, { ...this.options, tries: queueInteger(tries, "Dispatch tries", 1) }); }
  dispatch(): Promise<JobDispatchReceipt> {
    // Capture synchronous serialization now; convert validation errors into the shared rejection.
    if (!this.#promise) {
      let resolve!: (receipt: JobDispatchReceipt) => void;
      let reject!: (error: unknown) => void;
      this.#promise = new Promise<JobDispatchReceipt>((settle, fail) => { resolve = settle; reject = fail; });
      try { void this.submit(this.options).then(resolve, reject); }
      catch (error) { reject(error); }
    }
    return this.#promise;
  }
}

export class QueueManager {
  readonly #jobs = new Map<JobConstructor, RegisteredJob>();
  readonly #ids = new Map<string, RegisteredJob>();
  readonly #queuedListeners = new Map<Function, RegisteredJob>();
  readonly #eventCodecs: readonly QueueEventCodec<any, any>[];
  readonly #pending = new Set<Promise<unknown>>();
  readonly #serializer: JobSerializer;
  readonly #failedJobs: FailedJobStore;
  #storeInitialized = false;
  #driverInitialized = false;
  #initialized = false;
  #closing = false;
  #closePromise: Promise<void> | undefined;
  #worker: QueueWorker | undefined;
  constructor(private readonly application: Application, private readonly scopes: BunExecutionScopeManager, private readonly options?: BunQueueOptions) {
    validateQueueOptions(options); this.#serializer = options?.serializer ?? new JsonJobSerializer();
    this.#failedJobs = options?.failedJobs ?? new MemoryFailedJobStore();
    this.#eventCodecs = snapshotEventCodecs(options?.eventCodecs);
  }
  get configured(): boolean { return this.options !== undefined; }
  /** Adapter integration: one consumer per worker-role Application. */
  createWorker(): QueueWorker {
    if (this.#closing || (this.#initialized && this.application.state !== "running")) throw new BunQueueError("Create the worker before queue shutdown.");
    const driver = this.options?.driver; assertWorkerDriver(driver);
    return this.#worker ??= new QueueWorker(this.application, driver, this.#failedJobs, (envelope, cancellation) => this.executeAttempt(envelope, cancellation), this.options?.worker);
  }
  /** Adapter integration: consume generated identities, never inspect source or discover handlers. */
  consume(registry: RuntimeRegistry): void {
    if (this.#initialized || this.#closing) throw new BunQueueError("Job registry must be consumed before queue startup.");
    this.#jobs.clear(); this.#ids.clear(); this.#queuedListeners.clear();
    for (const entry of registry.classes) {
      if (entry.kind.id !== BUN_JOB_KIND.id) continue;
      const metadata = getManagedClassMetadata(entry.target);
      if (entry.kind !== BUN_JOB_KIND || metadata?.kindId !== BUN_JOB_KIND.id || metadata.decoratorId !== Job.definition.id || entry.scope !== "transient") throw new BunQueueError("Job registry requires canonical transient @Job classes.");
      const raw = entry.data as BunJobDefinition;
      const definition = compiledJobDefinition(metadata.data, raw as unknown as Record<string, unknown>);
      if (raw?.id !== definition.id) throw new BunQueueError("Generated job identity does not match its canonical decorator.");
      const plans = registry.methods.filter((plan) => plan.target === entry.target);
      const plan = plans[0];
      if (plans.length !== 1 || !plan || plan.kind !== BUN_JOB_HANDLE_KIND || plan.ownerKind !== BUN_JOB_KIND || plan.method !== "handle"
        || plan.parameters.some((parameter) => parameter.source !== "transport")) throw new BunQueueError("Job registry requires exactly one payload-only canonical handle plan.");
      if (this.#ids.has(definition.id) || this.#jobs.has(entry.target as JobConstructor)) throw new BunQueueError(`Duplicate job identity "${definition.id}".`);
      const registered = Object.freeze({ definition, plan });
      this.#jobs.set(entry.target as JobConstructor, registered); this.#ids.set(definition.id, registered);
    }
    for (const plan of registry.methods) {
      if (plan.kind.id === BUN_JOB_HANDLE_KIND.id && (!this.#jobs.has(plan.target as JobConstructor) || plan.kind !== BUN_JOB_HANDLE_KIND)) throw new BunQueueError("Orphan or noncanonical job handle plan.");
    }
    for (const attachment of registry.classAttachments ?? []) {
      if (attachment.definition.id !== Queue.definition.id) continue;
      if (attachment.definition !== Queue.definition) throw new BunQueueError("Queued listeners require the canonical @Queue definition.");
      defineManagedClassAttachment(attachment);
      const listener = registry.events.flatMap((event) => event.listeners).find((entry) => entry.target === attachment.target);
      if (!listener || listener.kind !== LISTENER_KIND || !registry.classes.includes(listener) || !registry.methods.includes(listener.handle)) throw new BunQueueError("Queued listener must reference the exact generated Core listener and handle plan.");
      const codec = this.#eventCodecs.find((entry) => entry.event === listener.event);
      if (!this.options || !codec) throw new BunQueueError("Every queued listener requires an explicit queue driver and one codec for its canonical event.");
      const definition = Queue.definition.createMetadata(attachment.data as BunJobDefinition);
      if (this.#ids.has(definition.id) || this.#queuedListeners.has(listener.target)) throw new BunQueueError(`Duplicate job or queued-listener identity "${definition.id}".`);
      const registered = Object.freeze({ definition, plan: listener.handle, codec });
      this.#ids.set(definition.id, registered); this.#queuedListeners.set(listener.target, registered);
    }
  }
  /** Core's ordered delivery interceptor supplies canonical records; no event redispatch occurs. */
  async deliverListener(listener: ListenerDefinition, event: object, next: () => Promise<void>): Promise<void> {
    const job = this.#queuedListeners.get(listener.target);
    if (!job) { await next(); return; }
    this.#assertOpen();
    const codec = job.codec!;
    const data = requireSynchronousCodecResult(codec.encode(event));
    await this.#submit(job, [Object.freeze({ codec: Object.freeze({ id: codec.id, version: codec.version }), data })], {});
  }
  async initialize(): Promise<void> {
    if (this.#initialized || this.#closing) throw new BunQueueError("Queue manager cannot initialize twice.");
    if (storeOwners.has(this.#failedJobs)) throw new BunQueueError("A failed-job store instance cannot be shared between Applications.");
    if (this.options && driverOwners.has(this.options.driver)) throw new BunQueueError("A queue driver instance cannot be shared between Applications.");
    storeOwners.add(this.#failedJobs);
    if (this.options) driverOwners.add(this.options.driver);
    this.#initialized = true;
    this.#storeInitialized = true;
    await this.#failedJobs.initialize();
    if (this.options) {
      // Own partial initialization too, so startup rollback always attempts close.
      this.#driverInitialized = true;
      await this.options.driver.initialize(Object.freeze({ execute: (envelope: QueueEnvelope) => this.executeAttempt(envelope) }));
    }
  }
  #assertOpen(): void {
    if (!this.#initialized || this.#closing || this.application.state !== "running") throw new BunQueueError("Queue operations require a running Application with open queues.");
  }
  async listFailed(): Promise<readonly FailedJobRecord[]> { this.#assertOpen(); return this.#track(Promise.resolve(this.#failedJobs.list())); }
  async getFailed(id: string): Promise<FailedJobRecord | undefined> { this.#assertOpen(); return this.#track(Promise.resolve(this.#failedJobs.get(id))); }
  async forgetFailed(id: string): Promise<boolean> { this.#assertOpen(); return this.#track(Promise.resolve(this.#failedJobs.forget(id))); }
  async flushFailed(): Promise<void> { this.#assertOpen(); return this.#track(Promise.resolve(this.#failedJobs.flush())); }
  retryFailed(id: string): Promise<JobDispatchReceipt> {
    this.#assertOpen();
    if (!this.options) return Promise.reject(new BunQueueError("Retry requires explicit BunAdapter queues.driver configuration."));
    const driver = this.options.driver;
    return this.#track((async () => {
      const record = await this.#failedJobs.get(id);
      if (!record) throw new BunQueueError(`Failed job "${id}" does not exist.`);
      const now = Date.now();
      const envelope = snapshotEnvelope({ ...record.envelope, id: crypto.randomUUID(), attempts: 0, createdAt: now, availableAt: now });
      await driver.push(envelope);
      // Keep the original until an explicit forget/flush; repeated retries are deliberate new jobs.
      return Object.freeze({ id: envelope.id, job: envelope.job, queue: envelope.queue });
    })());
  }
  job<T extends JobConstructor>(target: T, ...arguments_: JobArguments<T>): JobDispatchBuilder {
    return new JobDispatchBuilder((options) => this.#dispatch(target, arguments_, options));
  }
  #track<T>(promise: Promise<T>): Promise<T> {
    this.#pending.add(promise);
    void promise.then(() => this.#pending.delete(promise), () => this.#pending.delete(promise));
    return promise;
  }
  #dispatch(target: JobConstructor, arguments_: readonly unknown[], options: JobDispatchOptions): Promise<JobDispatchReceipt> {
    if (this.#closing || this.application.state !== "running" || !this.#initialized) throw new BunQueueError("Job dispatch requires a running Application with open queues.");
    if (!this.options) throw new BunQueueError("Job dispatch requires explicit BunAdapter queues.driver configuration.");
    const job = this.#jobs.get(target);
    if (!job) throw new BunQueueError("Job class is not in the generated canonical job registry.");
    this.#validateArguments(job, arguments_);
    return this.#submit(job, arguments_, options);
  }
  #submit(job: RegisteredJob, arguments_: readonly unknown[], options: JobDispatchOptions): Promise<JobDispatchReceipt> {
    this.#assertOpen();
    if (!this.options) throw new BunQueueError("Job dispatch requires explicit BunAdapter queues.driver configuration.");
    const delay = queueInteger(options.delay ?? 0, "Dispatch delay");
    if (delay && !this.options.driver.capabilities.delay) throw new BunQueueError("Queue driver does not support delayed availability.");
    const payload = this.#serializer.serialize(arguments_);
    if (typeof payload !== "string") throw new BunQueueError("Job serializer must return a string payload.");
    const now = Date.now();
    const envelope = snapshotEnvelope({ version: 1, id: crypto.randomUUID(), job: job.definition.id, payload,
      serializer: { id: this.#serializer.id, version: this.#serializer.version }, queue: options.queue ?? job.definition.queue,
      attempts: 0, createdAt: now, availableAt: now + delay,
      policy: jobPolicy({ ...job.definition, tries: options.tries ?? job.definition.tries }),
    });
    const receipt = Object.freeze({ id: envelope.id, job: envelope.job, queue: envelope.queue });
    return this.#track(Promise.resolve(this.options.driver.push(envelope)).then(() => receipt));
  }
  #validateArguments(job: RegisteredJob, arguments_: readonly unknown[]): void {
    if (!Array.isArray(arguments_)) throw new BunQueueError("Deserialized job arguments must be an array tuple.");
    const parameters = job.plan.parameters.filter((parameter) => parameter.source === "transport");
    const minimum = parameters.reduce((min, parameter) => parameter.optional ? min : Math.max(min, parameter.argumentIndex + 1), 0);
    if (arguments_.length < minimum || (!parameters.some((parameter) => parameter.rest) && arguments_.length > parameters.length)) throw new BunQueueError(`Job "${job.definition.id}" received an invalid payload argument count.`);
  }
  /** Adapter/worker boundary; accepted attempts await real settlement before scope cleanup. */
  executeAttempt(input: QueueEnvelope, cancellation = new AbortController()): Promise<void> {
    if (this.#closing || this.application.state !== "running") return Promise.reject(new BunQueueError("Job execution requires a running Application."));
    let envelope: QueueEnvelope;
    try { envelope = snapshotEnvelope(input); }
    catch (error) { return Promise.reject(new InvalidJobError("Invalid queued envelope.", { cause: error })); }
    return this.#track(this.scopes.run("queue-job", async (scope) => {
      scope.value(BUN_JOB_CONTEXT, Object.freeze({ envelope, scope, signal: cancellation.signal }));
      const timeout = envelope.policy.timeout;
      const started = performance.now();
      const timeoutError = new BunQueueError(`Job "${envelope.job}" exceeded its cooperative timeout.`);
      const timer = timeout === undefined ? undefined : setTimeout(() => cancellation.abort(timeoutError), timeout);
      const errors: unknown[] = [];
      try {
        if (cancellation.signal.aborted) throw cancellation.signal.reason;
        const job = this.#ids.get(envelope.job);
        if (!job || envelope.serializer.id !== this.#serializer.id || envelope.serializer.version !== this.#serializer.version) throw new InvalidJobError("Unknown job identity or incompatible serializer version.");
        let arguments_: readonly unknown[];
        try {
          arguments_ = this.#serializer.deserialize(envelope.payload);
          if (job.codec) {
            const wrapper = arguments_[0] as { codec?: { id?: unknown; version?: unknown }; data?: unknown } | undefined;
            if (!Array.isArray(arguments_) || arguments_.length !== 1 || !wrapper || typeof wrapper !== "object" || Array.isArray(wrapper)
              || Object.keys(wrapper).length !== 2 || !Object.hasOwn(wrapper, "data") || !wrapper.codec || typeof wrapper.codec !== "object"
              || Object.keys(wrapper.codec).length !== 2 || wrapper.codec.id !== job.codec.id || wrapper.codec.version !== job.codec.version) throw new BunQueueError("Unknown or incompatible queued event codec identity/version or payload wrapper.");
            const event = requireSynchronousCodecResult(job.codec.decode(wrapper.data));
            if (!event || typeof event !== "object" || Object.getPrototypeOf(event)?.constructor !== job.codec.event) throw new BunQueueError("Event codec must reconstruct its exact canonical event class.");
            arguments_ = [event];
            // Direct Core listeners remain root singletons; background attempts shadow them locally.
            scope.container.transient(job.plan.target);
          }
          this.#validateArguments(job, arguments_);
        }
        catch (error) { throw new InvalidJobError(`Invalid serialized job payload: ${failedJobError(error).message}`, { cause: error }); }
        await this.application.invokeManagedMethod(job.plan, arguments_, { parentContainer: scope.container });
      } catch (error) { errors.push(error); }
      finally { if (timer !== undefined) clearTimeout(timer); }
      // Synchronous handlers may block timers: elapsed time is checked at actual settlement too.
      if (timeout !== undefined && performance.now() - started >= timeout) cancellation.abort(timeoutError);
      if (cancellation.signal.aborted && !errors.includes(cancellation.signal.reason)) errors.push(cancellation.signal.reason);
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, "Job execution and cancellation failed.");
    }));
  }
  /** Reject new submissions and settle all accepted executions before scopes/driver cleanup. */
  async drain(): Promise<void> {
    this.#closing = true;
    const worker = this.#worker?.stop();
    const results = await Promise.allSettled([worker, ...this.#pending]);
    if (results[0]?.status === "rejected") throw results[0].reason;
  }
  close(): Promise<void> {
    return this.#closePromise ??= (async () => {
      const errors: unknown[] = [];
      try { if (this.#driverInitialized && this.options) await this.options.driver.close(); } catch (error) { errors.push(error); }
      try { if (this.#storeInitialized) await this.#failedJobs.close(); } catch (error) { errors.push(error); }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, "Queue driver and failed-job store cleanup failed.");
    })();
  }
}
