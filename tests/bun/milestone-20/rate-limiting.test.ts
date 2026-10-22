import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BunRateLimitManager, MemoryRateLimitBackend, type BunRateLimitBackend,
  type BunRateLimitConsumption, type BunRateLimitRequest,
} from "@bunwire/bun";

function fakeBackend(clock: () => number): BunRateLimitBackend {
  const buckets = new Map<string, { count: number; resetAtMs: number }>();
  return {
    async consume(request: BunRateLimitRequest): Promise<BunRateLimitConsumption> {
      const now = clock();
      const resetAtMs = (Math.floor(now / request.windowMs) + 1) * request.windowMs;
      const previous = buckets.get(request.key);
      const count = previous?.resetAtMs === resetAtMs ? previous.count : 0;
      const allowed = count < request.limit;
      buckets.set(request.key, { count: count + Number(allowed), resetAtMs });
      return { allowed, remaining: Math.max(0, request.limit - count - Number(allowed)), resetAtMs, retryAfterMs: resetAtMs - now };
    },
  };
}

describe("Bun Milestone 20 — rate limit backend", () => {
  it("keeps Redis packages out of Bun and Core dependencies", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
    for (const name of ["bun", "core"]) {
      const manifest = JSON.parse(readFileSync(path.join(root, "packages", name, "package.json"), "utf8")) as {
        dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>;
      };
      expect(Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies }).filter((dependency) => /redis|ioredis/i.test(dependency))).toEqual([]);
    }
  });
  for (const [name, create] of [
    ["memory", (clock: () => number) => new MemoryRateLimitBackend(clock)],
    ["public contract fake", fakeBackend],
  ] as const) {
    it(`${name} consumes atomically, separates keys, and resets on a fixed boundary`, async () => {
      let now = 1050;
      const backend = create(() => now);
      const request = { key: "api:user-1", limit: 2, windowMs: 1000 };
      const decisions = await Promise.all(Array.from({ length: 10 }, () => backend.consume(request)));
      expect(decisions.filter((decision) => decision.allowed)).toHaveLength(2);
      expect(decisions.at(-1)).toEqual({ allowed: false, remaining: 0, resetAtMs: 2000, retryAfterMs: 950 });
      expect((await backend.consume({ ...request, key: "api:user-2" })).allowed).toBe(true);
      now = 2000;
      expect(await backend.consume(request)).toEqual({ allowed: true, remaining: 1, resetAtMs: 3000, retryAfterMs: 1000 });
    });
  }

  it("rejects malformed policies and requires a declared backend failure choice", () => {
    const key = () => "user";
    for (const policy of [
      { name: "api", limit: 0, windowMs: 1000, key, onBackendError: "closed" },
      { name: "api", limit: 1, windowMs: 0, key, onBackendError: "closed" },
      { name: "api", limit: 1, windowMs: 1000, key, onBackendError: undefined },
    ]) expect(() => new BunRateLimitManager({ policies: [policy as never] })).toThrow();
    expect(() => new BunRateLimitManager({ policies: [
      { name: "api", limit: 1, windowMs: 1000, key, onBackendError: "open" },
      { name: "api", limit: 1, windowMs: 1000, key, onBackendError: "closed" },
    ] })).toThrow(/more than once/);
  });

  it("uses the configured failure behavior only for backend errors", async () => {
    const backend: BunRateLimitBackend = { async consume() { throw new Error("private backend error"); } };
    for (const failure of ["open", "closed"] as const) {
      const manager = new BunRateLimitManager({ backend, policies: [
        { name: "api", limit: 1, windowMs: 1000, key: () => "user", onBackendError: failure },
      ] });
      if (failure === "open") await expect(manager.consume("api", {} as never)).resolves.toBeUndefined();
      else await expect(manager.consume("api", {} as never)).rejects.toMatchObject({ status: 503, message: "Rate limit service unavailable" });
    }
    const invalid = new BunRateLimitManager({ backend, policies: [
      { name: "api", limit: 1, windowMs: 1000, key: () => "", onBackendError: "open" },
    ] });
    await expect(invalid.consume("api", {} as never)).rejects.toThrow(/key must return/);
  });
});
