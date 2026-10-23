import { createToken, type Token } from "@bunwire/core";

const DEFAULT_LIVENESS_PATH = "/health/live";
const DEFAULT_READINESS_PATH = "/health/ready";
const DEFAULT_TIMEOUT_MS = 2_000;
const STATIC_PATH = /^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/;

export type BunReadinessCheck = (signal: AbortSignal) => boolean | Promise<boolean>;

export interface BunHealthOptions {
  readonly livenessPath?: string;
  readonly readinessPath?: string;
  readonly checks?: Readonly<Record<string, BunReadinessCheck>>;
  readonly timeoutMs?: number;
}

export interface BunMaintenanceOptions {
  readonly initiallyEnabled?: boolean;
  readonly retryAfterSeconds?: number;
  readonly authorizeBypass?: (request: Request) => boolean | Promise<boolean>;
  readonly bypassTimeoutMs?: number;
}

export class BunOperationalHttpError extends Error {
  override readonly name = "BunOperationalHttpError";
}

function timeout(value: number | undefined, label: string): number {
  const chosen = value ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(chosen) || chosen < 1) {
    throw new BunOperationalHttpError(`${label} must be a positive safe integer in milliseconds.`);
  }
  return chosen;
}

function retryAfter(value: number | undefined): number | undefined {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new BunOperationalHttpError("Maintenance retryAfterSeconds must be a non-negative safe integer.");
  }
  return value;
}

function optionsObject(value: unknown, label: string): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BunOperationalHttpError(`${label} must be an object.`);
  }
}

function healthPath(value: string | undefined, fallback: string, label: string): string {
  const path = value ?? fallback;
  if (typeof path !== "string" || !STATIC_PATH.test(path)) {
    throw new BunOperationalHttpError(`${label} must be a static root-relative path without a query or fragment.`);
  }
  return path;
}

export function validateBunHealthOptions(options: BunHealthOptions): void {
  optionsObject(options, "Bun HTTP health options");
  const live = healthPath(options.livenessPath, DEFAULT_LIVENESS_PATH, "Liveness path");
  const ready = healthPath(options.readinessPath, DEFAULT_READINESS_PATH, "Readiness path");
  if (live === ready) throw new BunOperationalHttpError("Liveness and readiness paths must differ.");
  timeout(options.timeoutMs, "Health timeoutMs");
  if (options.checks !== undefined) {
    optionsObject(options.checks, "Health checks");
    for (const [name, check] of Object.entries(options.checks)) {
      if (name.trim().length === 0 || typeof check !== "function") {
        throw new BunOperationalHttpError("Health checks require non-empty names and callable checks.");
      }
    }
  }
}

export function validateBunMaintenanceOptions(options: BunMaintenanceOptions): void {
  optionsObject(options, "Bun HTTP maintenance options");
  if (options.initiallyEnabled !== undefined && typeof options.initiallyEnabled !== "boolean") {
    throw new BunOperationalHttpError("Maintenance initiallyEnabled must be a boolean.");
  }
  retryAfter(options.retryAfterSeconds);
  timeout(options.bypassTimeoutMs, "Maintenance bypassTimeoutMs");
  if (options.authorizeBypass !== undefined && typeof options.authorizeBypass !== "function") {
    throw new BunOperationalHttpError("Maintenance authorizeBypass must be callable.");
  }
}

function statusResponse(status: 200 | 503, method: string, retry?: number): Response {
  const headers = new Headers({ "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
  if (retry !== undefined) headers.set("Retry-After", String(retry));
  return new Response(method === "HEAD" ? null : JSON.stringify({ status: status === 200 ? "ok" : "unavailable" }), { status, headers });
}

function deadline<T>(operation: Promise<T>, milliseconds: number, fallback: T, abort?: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    operation,
    new Promise<T>((resolve) => {
      timer = setTimeout(() => { abort?.abort(); resolve(fallback); }, milliseconds);
    }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

export const BUN_MAINTENANCE: Token<BunMaintenance> = createToken<BunMaintenance>("bunwire.bun.maintenance");

export class BunMaintenance {
  readonly #defaultRetryAfterSeconds: number | undefined;
  readonly #authorizeBypass: BunMaintenanceOptions["authorizeBypass"];
  readonly #bypassTimeoutMs: number;
  #enabled: boolean;
  #retryAfterSeconds: number | undefined;

  constructor(options: BunMaintenanceOptions) {
    validateBunMaintenanceOptions(options);
    this.#enabled = options.initiallyEnabled ?? false;
    this.#defaultRetryAfterSeconds = options.retryAfterSeconds;
    this.#retryAfterSeconds = options.retryAfterSeconds;
    this.#authorizeBypass = options.authorizeBypass;
    this.#bypassTimeoutMs = timeout(options.bypassTimeoutMs, "Maintenance bypassTimeoutMs");
  }

  get enabled(): boolean { return this.#enabled; }

  enable(retryAfterSeconds?: number): void {
    this.#retryAfterSeconds = retryAfter(retryAfterSeconds) ?? this.#defaultRetryAfterSeconds;
    this.#enabled = true;
  }

  disable(): void { this.#enabled = false; }

  async gate(request: Request): Promise<Response | undefined> {
    if (!this.#enabled) return undefined;
    if (this.#authorizeBypass) {
      const authorized = await deadline(
        Promise.resolve().then(() => this.#authorizeBypass!(request)).then((result) => result === true, () => false),
        this.#bypassTimeoutMs,
        false,
      );
      if (authorized) return undefined;
    }
    return statusResponse(503, request.method, this.#retryAfterSeconds);
  }
}

export class BunHealthEndpoints {
  readonly livenessPath: string;
  readonly readinessPath: string;
  readonly #checks: readonly BunReadinessCheck[];
  readonly #timeoutMs: number;
  readonly #running: () => boolean;
  readonly #listening: () => boolean;
  readonly #maintenance: BunMaintenance | undefined;
  #activeChecks: Promise<readonly boolean[]> | undefined;

  constructor(options: BunHealthOptions, running: () => boolean, listening: () => boolean, maintenance?: BunMaintenance) {
    validateBunHealthOptions(options);
    this.livenessPath = healthPath(options.livenessPath, DEFAULT_LIVENESS_PATH, "Liveness path");
    this.readinessPath = healthPath(options.readinessPath, DEFAULT_READINESS_PATH, "Readiness path");
    this.#checks = Object.freeze(Object.values(options.checks ?? {}));
    this.#timeoutMs = timeout(options.timeoutMs, "Health timeoutMs");
    this.#running = running;
    this.#listening = listening;
    this.#maintenance = maintenance;
  }

  liveness(method: string): Response {
    return statusResponse(this.#listening() ? 200 : 503, method);
  }

  async readiness(method: string): Promise<Response> {
    if (!this.#listening() || !this.#running() || this.#maintenance?.enabled) return statusResponse(503, method);
    if (this.#activeChecks) return statusResponse(503, method);
    if (this.#checks.length === 0) return statusResponse(200, method);
    const abort = new AbortController();
    const checks = Promise.all(this.#checks.map(async (check) => {
      try { return await check(abort.signal) === true; }
      catch { return false; }
    }));
    this.#activeChecks = checks;
    void checks.then(() => {
      if (this.#activeChecks === checks) this.#activeChecks = undefined;
    });
    const results = await deadline(checks, this.#timeoutMs, [false], abort);
    return statusResponse(results.every(Boolean) && this.#running() && !this.#maintenance?.enabled ? 200 : 503, method);
  }
}
