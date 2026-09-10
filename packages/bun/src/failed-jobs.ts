import { BunQueueError, queueInteger } from "./jobs.js";
import { snapshotEnvelope, type QueueEnvelope } from "./queue-driver.js";

export type FailedJobReason = "exhausted" | "fatal" | "invalid";
export interface FailedJobError {
  readonly name: string;
  readonly message: string;
  readonly errors?: readonly FailedJobError[];
  readonly cause?: FailedJobError;
}
export interface FailedJobRecord {
  readonly envelope: QueueEnvelope;
  readonly failedAt: number;
  readonly reason: FailedJobReason;
  readonly error: FailedJobError;
}
export interface FailedJobStore {
  initialize(): void | Promise<void>;
  /** Idempotent by envelope ID: preserve the first terminal record. */
  save(record: FailedJobRecord): void | Promise<void>;
  list(): readonly FailedJobRecord[] | Promise<readonly FailedJobRecord[]>;
  get(id: string): FailedJobRecord | undefined | Promise<FailedJobRecord | undefined>;
  forget(id: string): boolean | Promise<boolean>;
  flush(): void | Promise<void>;
  close(): void | Promise<void>;
}

/** Safe diagnostic data only: never serialize arbitrary thrown objects or invoke their getters. */
export function failedJobError(error: unknown): FailedJobError {
  const seen = new Set<object>();
  function visit(value: unknown, depth: number): FailedJobError {
    if (typeof value === "string") return Object.freeze({ name: "Error", message: value });
    if (!value || typeof value !== "object") return Object.freeze({ name: "Error", message: "Non-Error value thrown." });
    if (depth >= 8 || seen.has(value)) return Object.freeze({ name: "Error", message: "Circular or deeply nested error omitted." });
    seen.add(value);
    try {
      const own = Object.getOwnPropertyDescriptors(value);
      const data = (key: string): unknown => own[key] && "value" in own[key]! ? own[key]!.value : undefined;
      const message = data("message"); const name = data("name"); const errors = data("errors");
      const nested: FailedJobError[] = [];
      if (Array.isArray(errors)) {
        const descriptors = Object.getOwnPropertyDescriptors(errors);
        for (let index = 0; index < Math.min(errors.length, 100); index++) {
          const descriptor = descriptors[String(index)];
          if (descriptor && "value" in descriptor) nested.push(visit(descriptor.value, depth + 1));
        }
      }
      return Object.freeze({ name: typeof name === "string" ? name : Array.isArray(errors) ? "AggregateError" : "Error",
        message: typeof message === "string" ? message : "Non-Error value thrown.",
        ...(Array.isArray(errors) ? { errors: Object.freeze(nested) } : {}),
        ...(data("cause") !== undefined ? { cause: visit(data("cause"), depth + 1) } : {}),
      });
    } catch { return Object.freeze({ name: "Error", message: "Unreadable thrown value." }); }
  }
  return visit(error, 0);
}

function snapshotRecord(record: FailedJobRecord): FailedJobRecord {
  if (!record || !["exhausted", "fatal", "invalid"].includes(record.reason)) throw new BunQueueError("Invalid failed-job terminal reason.");
  return Object.freeze({ envelope: snapshotEnvelope(record.envelope), failedAt: queueInteger(record.failedAt, "Failed time"),
    reason: record.reason, error: failedJobError(record.error) });
}

/** Non-durable development store. Closing clears process-local records. */
export class MemoryFailedJobStore implements FailedJobStore {
  readonly #records = new Map<string, FailedJobRecord>();
  #initialized = false;
  #closed = false;
  initialize(): void {
    if (this.#initialized || this.#closed) throw new BunQueueError("Failed-job store cannot initialize more than once.");
    this.#initialized = true;
  }
  #assertOpen(): void {
    if (!this.#initialized || this.#closed) throw new BunQueueError("Failed-job store is not open.");
  }
  save(input: FailedJobRecord): void {
    this.#assertOpen(); const record = snapshotRecord(input);
    if (!this.#records.has(record.envelope.id)) this.#records.set(record.envelope.id, record);
  }
  list(): readonly FailedJobRecord[] { this.#assertOpen(); return Object.freeze([...this.#records.values()]); }
  get(id: string): FailedJobRecord | undefined { this.#assertOpen(); return this.#records.get(id); }
  forget(id: string): boolean { this.#assertOpen(); return this.#records.delete(id); }
  flush(): void { this.#assertOpen(); this.#records.clear(); }
  close(): void { this.#closed = true; this.#records.clear(); }
}
