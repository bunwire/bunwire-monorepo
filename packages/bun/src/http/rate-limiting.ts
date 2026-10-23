import { Middleware, createToken, type MiddlewareNext, type Token } from "@bunwire/core";
import { BunHttpException } from "./exceptions.js";
import type { BunHttpContext } from "./http.js";
import type { BunMiddlewareContext } from "./middleware.js";

/** A backend owns its clock. resetAtMs and retryAfterMs must use that same clock. */
export interface BunRateLimitConsumption {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAtMs: number;
  readonly retryAfterMs: number;
}

export interface BunRateLimitRequest {
  /** Already namespaced by policy; opaque to the backend. */
  readonly key: string;
  readonly limit: number;
  readonly windowMs: number;
}

export interface BunRateLimitBackend {
  /** Atomically consume one request in an epoch-aligned fixed window. */
  consume(request: BunRateLimitRequest): Promise<BunRateLimitConsumption>;
}

export interface BunRateLimitPolicy<Principal = unknown> {
  readonly name: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly key: (context: BunHttpContext<Principal>) => string | Promise<string>;
  readonly onBackendError: "open" | "closed";
}

export interface BunRateLimitOptions<Principal = unknown> {
  readonly policies: readonly BunRateLimitPolicy<Principal>[];
  readonly backend?: BunRateLimitBackend;
}

export class BunRateLimitError extends Error {
  override readonly name = "BunRateLimitError";
}

export const BUN_RATE_LIMIT_MANAGER: Token<BunRateLimitManager> =
  createToken<BunRateLimitManager>("bunwire.bun.rate-limit-manager");

function positiveInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new BunRateLimitError(`${label} must be a positive safe integer.`);
  }
}

export function validateBunRateLimitOptions<Principal>(options: BunRateLimitOptions<Principal>): void {
  if (!options || typeof options !== "object" || Array.isArray(options)
    || !Array.isArray(options.policies) || options.policies.length === 0) {
    throw new BunRateLimitError("Rate limiting requires a non-empty policies array.");
  }
  if (options.backend !== undefined && (typeof options.backend !== "object" || options.backend === null
    || typeof options.backend.consume !== "function")) {
    throw new BunRateLimitError("Rate limit backend must provide consume().");
  }
  const names = new Set<string>();
  for (const policy of options.policies) {
    if (!policy || typeof policy !== "object" || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(policy.name)) {
      throw new BunRateLimitError("Rate limit policy names must be non-empty identifiers containing letters, numbers, '_' or '-'.");
    }
    if (names.has(policy.name)) throw new BunRateLimitError(`Rate limit policy ${JSON.stringify(policy.name)} is registered more than once.`);
    names.add(policy.name);
    positiveInteger(policy.limit, `Rate limit policy ${JSON.stringify(policy.name)} limit`);
    positiveInteger(policy.windowMs, `Rate limit policy ${JSON.stringify(policy.name)} windowMs`);
    if (typeof policy.key !== "function") throw new BunRateLimitError(`Rate limit policy ${JSON.stringify(policy.name)} key must be callable.`);
    if (policy.onBackendError !== "open" && policy.onBackendError !== "closed") {
      throw new BunRateLimitError(`Rate limit policy ${JSON.stringify(policy.name)} onBackendError must be "open" or "closed".`);
    }
  }
}

/** Process-local backend. A different process has an independent quota. */
export class MemoryRateLimitBackend implements BunRateLimitBackend {
  readonly #clock: () => number;
  readonly #buckets = new Map<string, { count: number; resetAtMs: number }>();
  #operations = 0;

  constructor(clock: () => number = Date.now) {
    if (typeof clock !== "function") throw new BunRateLimitError("Rate limit clock must be callable.");
    this.#clock = clock;
  }

  async consume(request: BunRateLimitRequest): Promise<BunRateLimitConsumption> {
    if (!request || typeof request.key !== "string" || request.key.length === 0) {
      throw new BunRateLimitError("Rate limit backend key must be a non-empty string.");
    }
    positiveInteger(request.limit, "Rate limit backend limit");
    positiveInteger(request.windowMs, "Rate limit backend windowMs");
    const now = this.#clock();
    if (!Number.isFinite(now) || now < 0) throw new BunRateLimitError("Rate limit clock must return a finite non-negative epoch millisecond value.");
    const resetAtMs = (Math.floor(now / request.windowMs) + 1) * request.windowMs;
    const bucket = this.#buckets.get(request.key);
    const count = bucket?.resetAtMs === resetAtMs ? bucket.count : 0;
    const allowed = count < request.limit;
    this.#buckets.set(request.key, { count: allowed ? count + 1 : count, resetAtMs });
    if (++this.#operations % 256 === 0) {
      for (const [key, value] of this.#buckets) if (value.resetAtMs <= now) this.#buckets.delete(key);
    }
    return { allowed, remaining: Math.max(0, request.limit - count - (allowed ? 1 : 0)),
      resetAtMs, retryAfterMs: Math.max(0, resetAtMs - now) };
  }
}

export class BunRateLimitManager<Principal = unknown> {
  readonly policies: ReadonlyMap<string, BunRateLimitPolicy<Principal>>;
  readonly backend: BunRateLimitBackend;

  constructor(options: BunRateLimitOptions<Principal>) {
    validateBunRateLimitOptions(options);
    this.policies = new Map(options.policies.map((policy) => [policy.name, Object.freeze({ ...policy })]));
    this.backend = options.backend ?? new MemoryRateLimitBackend();
  }

  hasPolicy(name: string): boolean { return this.policies.has(name); }

  async consume(name: string, context: BunHttpContext<Principal>): Promise<void> {
    const policy = this.policies.get(name);
    if (!policy) throw new BunRateLimitError(`Unknown rate limit policy ${JSON.stringify(name)}.`);
    const identity = await policy.key(context);
    if (typeof identity !== "string" || identity.length === 0) {
      throw new BunRateLimitError(`Rate limit policy ${JSON.stringify(name)} key must return a non-empty string.`);
    }
    let decision: BunRateLimitConsumption;
    try {
      decision = await this.backend.consume({ key: JSON.stringify([name, identity]), limit: policy.limit, windowMs: policy.windowMs });
      if (!decision || typeof decision.allowed !== "boolean" || !Number.isSafeInteger(decision.remaining)
        || decision.remaining < 0 || decision.remaining > policy.limit
        || !Number.isFinite(decision.resetAtMs) || decision.resetAtMs < 0
        || !Number.isFinite(decision.retryAfterMs) || decision.retryAfterMs < 0) {
        throw new BunRateLimitError("Rate limit backend returned an invalid decision.");
      }
    } catch {
      if (policy.onBackendError === "open") return;
      throw new BunHttpException(503, "Rate limit service unavailable", { headers: { "Cache-Control": "no-store" } });
    }
    if (!decision.allowed) {
      throw new BunHttpException(429, "Too Many Requests", { headers: {
        "Retry-After": String(Math.max(1, Math.ceil(decision.retryAfterMs / 1000))),
        "Cache-Control": "no-store",
      } });
    }
  }
}

@Middleware()
export class ThrottleMiddleware {
  async handle(context: BunMiddlewareContext, next: MiddlewareNext<Response>): Promise<Response> {
    if (!context.rateLimit) throw new BunRateLimitError("The throttle middleware requires configured Bun rate limiting.");
    if (context.parameters.length !== 1) throw new BunRateLimitError("The throttle middleware requires exactly one policy name.");
    await context.rateLimit.consume(context.parameters[0]!, context);
    return next();
  }
}
