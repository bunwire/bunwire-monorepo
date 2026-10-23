import { BunQueueError, jobPolicy, queueInteger, queueName, type JobPolicy } from "./jobs.js";

export interface QueueEnvelope {
  readonly version: 1;
  readonly id: string;
  readonly job: string;
  readonly payload: string;
  readonly serializer: { readonly id: string; readonly version: number };
  readonly queue: string;
  readonly attempts: number;
  readonly createdAt: number;
  readonly availableAt: number;
  readonly policy: JobPolicy;
}
export interface QueueReservation {
  readonly envelope: QueueEnvelope;
  readonly lease: string;
  readonly reservedAt: number;
  readonly expiresAt: number;
}
export interface QueueDriverContext { readonly execute: (envelope: QueueEnvelope) => Promise<void> }
export interface QueueDriver {
  readonly capabilities: { readonly delay: boolean; readonly reservations: boolean; readonly renewal?: boolean };
  initialize(context: QueueDriverContext): void | Promise<void>;
  push(envelope: QueueEnvelope): void | Promise<void>;
  reserve(queue: string, leaseMilliseconds: number): QueueReservation | undefined | Promise<QueueReservation | undefined>;
  /** Extend the current lease without changing its fencing token. Reject a lost/expired lease. */
  renew?(reservation: QueueReservation, leaseMilliseconds: number): QueueReservation | Promise<QueueReservation>;
  acknowledge(reservation: QueueReservation): void | Promise<void>;
  release(reservation: QueueReservation, delayMilliseconds?: number): void | Promise<void>;
  fail(reservation: QueueReservation, error: unknown): void | Promise<void>;
  close(): void | Promise<void>;
}

export function snapshotEnvelope(envelope: QueueEnvelope): QueueEnvelope {
  if (!envelope || envelope.version !== 1 || typeof envelope.id !== "string" || !envelope.id
    || typeof envelope.job !== "string" || !envelope.job || typeof envelope.payload !== "string"
    || !envelope.serializer || typeof envelope.serializer.id !== "string" || !envelope.serializer.id) throw new BunQueueError("Invalid versioned queue envelope.");
  return Object.freeze({ version: 1, id: envelope.id, job: envelope.job, payload: envelope.payload,
    serializer: Object.freeze({ id: envelope.serializer.id, version: queueInteger(envelope.serializer.version, "Serializer version", 1) }),
    queue: queueName(envelope.queue), attempts: queueInteger(envelope.attempts, "Attempts"),
    createdAt: queueInteger(envelope.createdAt, "Created time"), availableAt: queueInteger(envelope.availableAt, "Available time"), policy: jobPolicy(envelope.policy),
  });
}

export class SyncQueueDriver implements QueueDriver {
  readonly capabilities = Object.freeze({ delay: false, reservations: false });
  #context: QueueDriverContext | undefined;
  #closed = false;
  initialize(context: QueueDriverContext): void {
    if (this.#context || this.#closed) throw new BunQueueError("Queue driver cannot be initialized more than once.");
    this.#context = context;
  }
  async push(input: QueueEnvelope): Promise<void> {
    if (!this.#context || this.#closed) throw new BunQueueError("Queue driver is not open.");
    const envelope = snapshotEnvelope(input);
    if (envelope.availableAt > envelope.createdAt) throw new BunQueueError("Sync queue driver does not support delay.");
    await this.#context.execute(snapshotEnvelope({ ...envelope, attempts: envelope.attempts + 1 }));
  }
  #unsupported(): never { throw new BunQueueError("Sync queue driver does not support reservations."); }
  reserve(_queue: string, _leaseMilliseconds: number): never { return this.#unsupported(); }
  acknowledge(_reservation: QueueReservation): never { return this.#unsupported(); }
  release(_reservation: QueueReservation, _delayMilliseconds = 0): never { return this.#unsupported(); }
  fail(_reservation: QueueReservation, _error: unknown): never { return this.#unsupported(); }
  close(): void { this.#closed = true; }
}

interface MemoryEntry { envelope: QueueEnvelope; reservation?: QueueReservation }
export class MemoryQueueDriver implements QueueDriver {
  readonly capabilities = Object.freeze({ delay: true, reservations: true, renewal: true });
  readonly #entries = new Map<string, MemoryEntry>();
  readonly #clock: () => number;
  #initialized = false;
  #closed = false;
  constructor(options: { readonly now?: () => number } = {}) { this.#clock = options.now ?? Date.now; }
  initialize(_context: QueueDriverContext): void {
    if (this.#initialized || this.#closed) throw new BunQueueError("Queue driver cannot be initialized more than once.");
    this.#initialized = true;
  }
  #assertOpen(): void { if (!this.#initialized || this.#closed) throw new BunQueueError("Queue driver is not open."); }
  push(input: QueueEnvelope): void {
    this.#assertOpen();
    const envelope = snapshotEnvelope(input);
    if (this.#entries.has(envelope.id)) throw new BunQueueError("Duplicate queued-job ID.");
    this.#entries.set(envelope.id, { envelope });
  }
  reserve(queue: string, leaseMilliseconds: number): QueueReservation | undefined {
    this.#assertOpen(); queueName(queue); queueInteger(leaseMilliseconds, "Lease duration", 1);
    const now = queueInteger(this.#clock(), "Current time");
    const entry = [...this.#entries.values()].filter((entry) => entry.envelope.queue === queue
      && entry.envelope.availableAt <= now && (!entry.reservation || entry.reservation.expiresAt <= now))
      .sort((left, right) => left.envelope.availableAt - right.envelope.availableAt)[0];
    if (!entry) return undefined;
    entry.envelope = snapshotEnvelope({ ...entry.envelope, attempts: entry.envelope.attempts + 1 });
    const reservation = Object.freeze({ envelope: entry.envelope, lease: crypto.randomUUID(), reservedAt: now,
      expiresAt: queueInteger(now + leaseMilliseconds, "Lease expiry") });
    entry.reservation = reservation;
    return reservation;
  }
  #current(reservation: QueueReservation): MemoryEntry {
    this.#assertOpen();
    const entry = this.#entries.get(reservation.envelope.id);
    if (!entry?.reservation || entry.reservation.lease !== reservation.lease
      || entry.reservation.expiresAt <= this.#clock()) throw new BunQueueError("Queue reservation lease is stale or expired.");
    return entry;
  }
  renew(reservation: QueueReservation, leaseMilliseconds: number): QueueReservation {
    const entry = this.#current(reservation);
    const expiresAt = queueInteger(this.#clock() + queueInteger(leaseMilliseconds, "Lease duration", 1), "Lease expiry");
    // Renewal never shortens an existing reservation or changes its identity/attempt count.
    const renewed = Object.freeze({ ...entry.reservation!, expiresAt: Math.max(entry.reservation!.expiresAt, expiresAt) });
    entry.reservation = renewed;
    return renewed;
  }
  acknowledge(reservation: QueueReservation): void { this.#current(reservation); this.#entries.delete(reservation.envelope.id); }
  release(reservation: QueueReservation, delayMilliseconds = 0): void {
    const entry = this.#current(reservation);
    const availableAt = queueInteger(this.#clock() + queueInteger(delayMilliseconds, "Release delay"), "Available time");
    entry.envelope = snapshotEnvelope({ ...entry.envelope, availableAt });
    delete entry.reservation;
  }
  fail(reservation: QueueReservation, _error: unknown): void { this.acknowledge(reservation); }
  close(): void { this.#closed = true; this.#entries.clear(); }
}
