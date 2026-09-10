import { describe, expect, it, vi } from "vitest";
import { defineApp, defineRuntimeRegistry } from "@bunwire/core";
import { BunAdapter, BUN_QUEUE_MANAGER, MemoryQueueDriver, MemoryFailedJobStore, type QueueEnvelope, type FailedJobRecord } from "@bunwire/bun";

const envelope = (id = "one"): QueueEnvelope => ({ version: 1, id, job: "test.job", payload: "[]", serializer: { id: "bun.json", version: 1 },
  queue: "default", attempts: 2, createdAt: 0, availableAt: 0, policy: { tries: 3, backoff: [10] } });
const record = (id = "one"): FailedJobRecord => ({ envelope: envelope(id), failedAt: 100, reason: "exhausted", error: { name: "Error", message: "broken" } });

describe("renewable memory reservations", () => {
  it("renews without changing token/attempt and prevents recovery until the renewed expiry", () => {
    let now = 0; const driver = new MemoryQueueDriver({ now: () => now }); driver.initialize({ execute: async () => {} });
    driver.push(envelope()); const reservation = driver.reserve("default", 30)!;
    now = 20; const renewed = driver.renew(reservation, 30);
    expect(renewed).toMatchObject({ lease: reservation.lease, reservedAt: 0, expiresAt: 50 });
    expect(renewed.envelope).toBe(reservation.envelope); expect(Object.isFrozen(renewed)).toBe(true);
    now = 31; expect(driver.reserve("default", 30)).toBeUndefined();
    expect(driver.renew(reservation, 1).expiresAt).toBe(50);
    now = 50; expect(() => driver.renew(reservation, 30)).toThrow(/stale or expired/);
    const next = driver.reserve("default", 30)!; expect(next.lease).not.toBe(reservation.lease);
    expect(next.envelope.attempts).toBe(reservation.envelope.attempts + 1);
    for (const settle of [() => driver.acknowledge(reservation), () => driver.release(reservation), () => driver.fail(reservation, "error")]) expect(settle).toThrow(/stale/);
    driver.acknowledge(next); expect(driver.reserve("default", 30)).toBeUndefined(); driver.close();
  });
  it("validates renewal duration and allows settlement using the unchanged fencing token", () => {
    const driver = new MemoryQueueDriver({ now: () => 0 }); driver.initialize({ execute: async () => {} }); driver.push(envelope());
    const reservation = driver.reserve("default", 30)!;
    for (const duration of [0, -1, 1.5, NaN, Infinity]) expect(() => driver.renew(reservation, duration)).toThrow();
    driver.renew(reservation, 100); driver.release(reservation); expect(driver.reserve("default", 30)).toBeDefined(); driver.close();
  });
});

describe("failed-job store", () => {
  it("has explicit lifecycle, idempotent writes, immutable snapshots, forget and flush", () => {
    const store = new MemoryFailedJobStore(); expect(() => store.list()).toThrow(/not open/); store.initialize();
    const first = record(); store.save(first); store.save({ ...first, failedAt: 200 });
    expect(store.get("one")?.failedAt).toBe(100); expect(store.get("one")).not.toBe(first);
    expect(Object.isFrozen(store.list())).toBe(true); expect(Object.isFrozen(store.get("one")!.envelope.policy.backoff)).toBe(true);
    store.save(record("two")); expect(store.list()).toHaveLength(2); expect(store.forget("one")).toBe(true); expect(store.forget("one")).toBe(false);
    store.flush(); expect(store.list()).toEqual([]); store.close(); store.close();
    expect(() => store.get("one")).toThrow(/not open/); expect(() => store.initialize()).toThrow(/more than once/);
  });
  it("preserves aggregate/cause details without invoking arbitrary getters or cycles", () => {
    const store = new MemoryFailedJobStore(); store.initialize(); const getter = vi.fn(() => { throw new Error("getter"); });
    const error = new AggregateError([new Error("first"), Object.defineProperty({}, "message", { get: getter })], "both", { cause: new Error("cause") });
    store.save({ ...record(), error: error as unknown as FailedJobRecord["error"] }); const saved = store.get("one")!;
    expect(saved.error).toMatchObject({ name: "AggregateError", message: "both", errors: [{ message: "first" }, { message: "Non-Error value thrown." }], cause: { message: "cause" } });
    expect(getter).not.toHaveBeenCalled(); expect(() => JSON.stringify(saved)).not.toThrow();
    const cycle = new Error("cycle", { cause: null }); cycle.cause = cycle;
    store.save({ ...record("cycle"), error: cycle as unknown as FailedJobRecord["error"] }); expect(JSON.stringify(store.get("cycle"))).toContain("Circular"); store.close();
  });
});

describe("failed-job management lifecycle", () => {
  async function start(driver = new MemoryQueueDriver(), failedJobs = new MemoryFailedJobStore()) {
    const app = defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false, queues: { driver, failedJobs } })).withRuntimeRegistry(defineRuntimeRegistry({}));
    await app.start(); return { app, driver, failedJobs, manager: app.rootContainer.get(BUN_QUEUE_MANAGER) };
  }
  it("retries with fresh IDs, reset attempts and unchanged payload/policy while retaining the original", async () => {
    const { app, driver, failedJobs, manager } = await start();
    try {
      failedJobs.save(record()); const push = vi.spyOn(driver, "push");
      const first = await manager.retryFailed("one"); const second = await manager.retryFailed("one");
      expect(first.id).not.toBe(second.id); expect(first.id).not.toBe("one");
      expect(push.mock.calls[0]![0]).toMatchObject({ attempts: 0, payload: "[]", policy: envelope().policy, serializer: envelope().serializer });
      expect(push.mock.calls[0]![0].availableAt).toBe(push.mock.calls[0]![0].createdAt);
      expect(await manager.getFailed("one")).toEqual(record()); expect(await manager.listFailed()).toHaveLength(1);
      expect(await manager.forgetFailed("one")).toBe(true); await expect(manager.retryFailed("one")).rejects.toThrow(/does not exist/);
      failedJobs.save(record()); await manager.flushFailed(); expect(await manager.listFailed()).toEqual([]);
    } finally { await app.stop(); }
    await expect(manager.listFailed()).rejects.toThrow(/running/);
  });
  it("prevents shared stores without closing another Application's resource", async () => {
    const first = await start(); const close = vi.spyOn(first.failedJobs, "close");
    try { await expect(start(new MemoryQueueDriver(), first.failedJobs)).rejects.toThrow(/shared/); expect(close).not.toHaveBeenCalled(); }
    finally { await first.app.stop(); } expect(close).toHaveBeenCalledTimes(1);
  });
  it("closes partial store initialization and aggregates driver/store cleanup failures", async () => {
    const error = new Error("initialize"); const failed = new MemoryFailedJobStore(); const close = vi.spyOn(failed, "close");
    vi.spyOn(failed, "initialize").mockImplementation(() => { throw error; });
    await expect(start(new MemoryQueueDriver(), failed)).rejects.toBe(error); expect(close).toHaveBeenCalledTimes(1);
    const running = await start(); const driverError = new Error("driver"); const storeError = new Error("store");
    vi.spyOn(running.driver, "close").mockImplementation(() => { throw driverError; });
    vi.spyOn(running.failedJobs, "close").mockImplementation(() => { throw storeError; });
    await expect(running.app.stop()).rejects.toMatchObject({ errors: [driverError, storeError] }); expect(running.app.state).toBe("failed");
  });
});
