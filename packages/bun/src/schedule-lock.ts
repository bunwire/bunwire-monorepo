import { BunScheduleError } from "./cron.js";

export type ScheduleLockMode = "overlap" | "single-server";
export type ScheduleExecutionOutcome = "success" | "failure" | "shutdown";
export interface ScheduleLockRequest { readonly key: string; readonly mode: ScheduleLockMode; readonly owner: string; readonly leaseMilliseconds: number; readonly scheduledAt: number }
export interface ScheduleLockLease { readonly key: string; readonly mode: ScheduleLockMode; readonly owner: string; readonly token: string; readonly expiresAt: number; readonly scheduledAt: number }
export interface ScheduleLockProvider {
  /** True only when leases coordinate all scheduler instances that share the backend. */
  readonly capabilities: { readonly distributed: boolean };
  initialize(): void | Promise<void>;
  acquire(request: ScheduleLockRequest): ScheduleLockLease | undefined | Promise<ScheduleLockLease | undefined>;
  renew(lease: ScheduleLockLease, leaseMilliseconds: number): ScheduleLockLease | Promise<ScheduleLockLease>;
  /**
   * Release a lease after work settles. Distributed providers must preserve a
   * successful single-server occurrence claim long enough to prevent another
   * scheduler from running the same schedule ID and scheduledAt pair.
   */
  release(lease: ScheduleLockLease, outcome: ScheduleExecutionOutcome): void | Promise<void>;
  close(): void | Promise<void>;
}
interface Entry { lease: ScheduleLockLease }
/** Process-local development lock provider with fenced expiring leases. */
export class MemoryScheduleLockProvider implements ScheduleLockProvider {
  readonly capabilities = Object.freeze({ distributed: false }); readonly #entries = new Map<string, Entry>();
  #open = false; #closed = false;
  constructor(private readonly now: () => number = Date.now) {}
  initialize(): void { if (this.#open || this.#closed) throw new BunScheduleError("Schedule lock provider cannot initialize twice."); this.#open = true; }
  #assert(): void { if (!this.#open || this.#closed) throw new BunScheduleError("Schedule lock provider is not open."); }
  acquire(request: ScheduleLockRequest): ScheduleLockLease | undefined {
    this.#assert(); if (!request.key || !request.owner || !["overlap", "single-server"].includes(request.mode) || !Number.isSafeInteger(request.leaseMilliseconds) || request.leaseMilliseconds < 1) throw new BunScheduleError("Invalid schedule lock request.");
    const now = this.now(); const current = this.#entries.get(request.key);
    if (current && current.lease.expiresAt > now) return undefined;
    const lease = Object.freeze({ key: request.key, mode: request.mode, owner: request.owner, token: crypto.randomUUID(), expiresAt: now + request.leaseMilliseconds, scheduledAt: request.scheduledAt });
    this.#entries.set(request.key, { lease }); return lease;
  }
  #current(lease: ScheduleLockLease): Entry { this.#assert(); const current = this.#entries.get(lease.key); if (!current || current.lease.token !== lease.token || current.lease.expiresAt !== lease.expiresAt || current.lease.expiresAt <= this.now()) throw new BunScheduleError("Schedule lock lease is stale or expired."); return current; }
  renew(lease: ScheduleLockLease, duration: number): ScheduleLockLease { const entry = this.#current(lease); if (!Number.isSafeInteger(duration) || duration < 1) throw new BunScheduleError("Schedule lock lease duration must be positive."); const renewed = Object.freeze({ ...entry.lease, expiresAt: Math.max(entry.lease.expiresAt, this.now() + duration) }); entry.lease = renewed; return renewed; }
  release(lease: ScheduleLockLease, _outcome: ScheduleExecutionOutcome): void { this.#current(lease); this.#entries.delete(lease.key); }
  close(): void { this.#closed = true; this.#entries.clear(); }
}
