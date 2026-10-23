import { BunHealthEndpoints, BunMaintenance, validateBunHealthOptions, validateBunMaintenanceOptions } from "../../../packages/bun/src/http/operational-http.js";
import { describe, expect, it, vi } from "vitest";

describe("Bun Milestone 19 — operational HTTP state", () => {
  it("validates paths, callbacks, and time bounds", () => {
    expect(() => validateBunHealthOptions({ livenessPath: "/health?secret=1" })).toThrow(/static root-relative/);
    expect(() => validateBunHealthOptions({ readinessPath: "/health/live" })).toThrow(/must differ/);
    expect(() => validateBunHealthOptions({ checks: { db: true as never } })).toThrow(/callable/);
    expect(() => validateBunHealthOptions({ timeoutMs: 0 })).toThrow(/positive/);
    expect(() => validateBunMaintenanceOptions({ retryAfterSeconds: -1 })).toThrow(/non-negative/);
    expect(() => validateBunMaintenanceOptions({ authorizeBypass: "yes" as never })).toThrow(/callable/);
    expect(() => validateBunMaintenanceOptions({ bypassTimeoutMs: 0 })).toThrow(/positive/);
  });

  it("distinguishes a listening host from application and dependency readiness", async () => {
    let listening = false;
    let running = false;
    let available = true;
    const check = vi.fn(async (_signal: AbortSignal) => available);
    const health = new BunHealthEndpoints({ checks: { database: check } }, () => running, () => listening);
    expect(health.liveness("GET").status).toBe(503);
    listening = true;
    expect(health.liveness("GET").status).toBe(200);
    expect((await health.readiness("GET")).status).toBe(503);
    expect(check).not.toHaveBeenCalled();
    running = true;
    expect((await health.readiness("GET")).status).toBe(200);
    available = false;
    expect((await health.readiness("GET")).status).toBe(503);
    running = false;
    expect((await health.readiness("GET")).status).toBe(503);
  });

  it("bounds throwing and stalled checks and reveals no check details", async () => {
    const throwing = new BunHealthEndpoints({ checks: {
      credentials: () => { throw new Error("database-password=secret"); },
    } }, () => true, () => true);
    const failure = await throwing.readiness("GET");
    expect(failure.status).toBe(503);
    expect(await failure.json()).toEqual({ status: "unavailable" });
    const health = new BunHealthEndpoints({ timeoutMs: 5, checks: {
      stalled: (signal) => new Promise<boolean>((resolve) => signal.addEventListener("abort", () => resolve(false))),
    } }, () => true, () => true);
    const response = await health.readiness("GET");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await (await health.readiness("HEAD")).text()).toBe("");
  });

  it("does not overlap readiness checks that ignore abort and recovers after settlement", async () => {
    let release!: (value: boolean) => void;
    const stalled = new Promise<boolean>((resolve) => { release = resolve; });
    const check = vi.fn().mockImplementationOnce(() => stalled).mockResolvedValue(true);
    const health = new BunHealthEndpoints({ timeoutMs: 5, checks: { database: check } }, () => true, () => true);
    expect((await health.readiness("GET")).status).toBe(503);
    expect((await health.readiness("GET")).status).toBe(503);
    expect((await health.readiness("HEAD")).status).toBe(503);
    expect(check).toHaveBeenCalledTimes(1);
    release(false);
    await vi.waitFor(async () => expect((await health.readiness("GET")).status).toBe(200));
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("switches maintenance at runtime and fails closed on bypass errors and timeouts", async () => {
    const authorized = new BunMaintenance({ retryAfterSeconds: 30, authorizeBypass: (request) => request.headers.get("X-Operator") === "approved" });
    const request = new Request("https://example.test/");
    expect(authorized.enabled).toBe(false);
    expect(await authorized.gate(request)).toBeUndefined();
    authorized.enable(10);
    expect(authorized.enabled).toBe(true);
    const blocked = await authorized.gate(request);
    expect(blocked?.status).toBe(503);
    expect(blocked?.headers.get("Retry-After")).toBe("10");
    expect(await authorized.gate(new Request(request, { headers: { "X-Operator": "approved" } }))).toBeUndefined();
    authorized.disable();
    expect(await authorized.gate(request)).toBeUndefined();

    const failed = new BunMaintenance({ initiallyEnabled: true, authorizeBypass: () => { throw new Error("secret"); } });
    expect((await failed.gate(request))?.status).toBe(503);
    const stalled = new BunMaintenance({ initiallyEnabled: true, bypassTimeoutMs: 5, authorizeBypass: () => new Promise<boolean>(() => undefined) });
    expect((await stalled.gate(request))?.status).toBe(503);
  });
});
