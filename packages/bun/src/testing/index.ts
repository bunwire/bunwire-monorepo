import { EventDispatcher } from "@bunwire/core";
import { MemoryQueueDriver, snapshotEnvelope, type QueueDriver, type QueueDriverContext, type QueueEnvelope, type QueueReservation } from "../jobs/queue-driver.js";
import type { BunScheduler } from "../scheduling/scheduler.js";

/** A per-client cookie jar for exercising an actual Bun HTTP application. */
export class BunTestClient {
  readonly #origin: URL;
  readonly #cookies = new Map<string, string>();

  constructor(origin: string | URL) {
    this.#origin = new URL(origin);
    if (!/^https?:$/.test(this.#origin.protocol)) throw new TypeError("BunTestClient requires an HTTP origin.");
  }

  get cookies(): ReadonlyMap<string, string> { return new Map(this.#cookies); }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = new URL(path, this.#origin);
    if (url.origin !== this.#origin.origin) throw new TypeError("BunTestClient requests must remain on the configured origin.");
    const headers = new Headers(init.headers);
    if (this.#cookies.size && !headers.has("cookie")) {
      headers.set("cookie", [...this.#cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    }
    const response = await fetch(url, { ...init, headers });
    const setCookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie() : [response.headers.get("set-cookie")].filter((entry): entry is string => entry !== null);
    for (const setCookie of setCookies) {
      const first = setCookie.split(";", 1)[0] ?? "";
      const separator = first.indexOf("=");
      if (separator < 1) continue;
      const name = first.slice(0, separator);
      const value = first.slice(separator + 1);
      if (value) this.#cookies.set(name, value);
      else this.#cookies.delete(name);
    }
    return response;
  }

  async csrfRequest(path: string, token: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("X-CSRF-TOKEN", token);
    return this.request(path, { ...init, headers });
  }

  async connectWebSocket(path: string): Promise<WebSocket> {
    const url = new URL(path, this.#origin);
    if (url.origin !== this.#origin.origin) throw new TypeError("BunTestClient WebSockets must remain on the configured origin.");
    url.protocol = this.#origin.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error(`WebSocket handshake failed for ${url.pathname}.`)), { once: true });
    });
    return socket;
  }
}

/** Bind an instance through a Provider to replace Core's EventDispatcher in one app. */
export class RecordingEventDispatcher extends EventDispatcher {
  readonly #events: object[] = [];
  get events(): readonly object[] { return Object.freeze([...this.#events]); }
  override async dispatch(event: object): Promise<void> { this.#events.push(event); }
  clear(): void { this.#events.length = 0; }
  assertDispatched(target: Function, count = 1): void {
    const actual = this.#events.filter((event) => Object.getPrototypeOf(event)?.constructor === target).length;
    if (actual !== count) throw new Error(`Expected ${target.name} to be dispatched ${count} time(s); observed ${actual}.`);
  }
}

/** Test-owned queue that records submissions while retaining real memory-driver leases. */
export class RecordingQueueDriver implements QueueDriver {
  readonly #driver: MemoryQueueDriver;
  readonly #envelopes: QueueEnvelope[] = [];
  readonly capabilities = Object.freeze({ delay: true, reservations: true, renewal: true });
  constructor(options: { readonly now?: () => number } = {}) { this.#driver = new MemoryQueueDriver(options); }
  get dispatched(): readonly QueueEnvelope[] { return Object.freeze([...this.#envelopes]); }
  initialize(context: QueueDriverContext): void | Promise<void> { return this.#driver.initialize(context); }
  async push(envelope: QueueEnvelope): Promise<void> { const copy = snapshotEnvelope(envelope); await this.#driver.push(copy); this.#envelopes.push(copy); }
  reserve(queue: string, leaseMilliseconds: number): QueueReservation | undefined | Promise<QueueReservation | undefined> { return this.#driver.reserve(queue, leaseMilliseconds); }
  renew(reservation: QueueReservation, leaseMilliseconds: number): QueueReservation | Promise<QueueReservation> { return this.#driver.renew(reservation, leaseMilliseconds); }
  acknowledge(reservation: QueueReservation): void | Promise<void> { return this.#driver.acknowledge(reservation); }
  release(reservation: QueueReservation, delayMilliseconds?: number): void | Promise<void> { return this.#driver.release(reservation, delayMilliseconds); }
  fail(reservation: QueueReservation, error: unknown): void | Promise<void> { return this.#driver.fail(reservation, error); }
  close(): void | Promise<void> { return this.#driver.close(); }
  assertDispatched(job: string, count = 1): void {
    const actual = this.#envelopes.filter((entry) => entry.job === job).length;
    if (actual !== count) throw new Error(`Expected job ${JSON.stringify(job)} to be dispatched ${count} time(s); observed ${actual}.`);
  }
}

/** Drive a scheduler deterministically without starting its timer loop. */
export function runScheduledTick(scheduler: Pick<BunScheduler, "runDue">, timestamp: number): Promise<number> {
  return scheduler.runDue(timestamp);
}
