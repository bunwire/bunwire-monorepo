import { describe, expect, it, vi } from "vitest";
import { bunNativeWebSocketHandler, createBunWebSocketRuntimeState, snapshotBunWebSocketIdentity } from "../../../packages/bun/src/websocket-runtime.js";
import { BunOperationObserver, type BunOperationRecord } from "../../../packages/bun/src/observability.js";

describe("WebSocket upgrade identity boundary", () => {
  it("copies and freezes nested plain identity without retaining the mapper object", () => {
    const original = { user: { id: "first" }, roles: ["member"] };
    const snapshot = snapshotBunWebSocketIdentity(original);
    original.user.id = "second";
    original.roles.push("admin");
    expect(snapshot).toEqual({ user: { id: "first" }, roles: ["member"] });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen((snapshot as { user: object }).user)).toBe(true);
  });
  it.each([
    [new Date(), /plain objects/],
    [new Map(), /plain objects/],
    [{ get principal() { return "hidden"; } }, /getters/],
    [{ value: Number.POSITIVE_INFINITY }, /JSON values/],
  ])("rejects request-scoped or non-JSON data %#", (value, message) => {
    expect(() => snapshotBunWebSocketIdentity(value)).toThrow(message);
  });
  it("rejects cyclic identities", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => snapshotBunWebSocketIdentity(cyclic)).toThrow(/cycles/);
  });
});

describe("WebSocket shutdown fallback", () => {
  it("reports a failed close hook as a failed connection lifecycle", async () => {
    const records: BunOperationRecord[] = [];
    const state = createBunWebSocketRuntimeState({}, new BunOperationObserver((record) => { records.push(record); }));
    state.invocation = { invoke: async () => { throw new Error("close failed"); } } as never;
    state.connections.set(1, { id: 1, socket: { data: { id: 1 } }, scope: { container: {}, dispose: async () => undefined },
      ready: Promise.resolve(), messages: new Set(), route: { path: "/chat", methods: new Map([["close", {}]]) },
      startedAt: performance.now(), messageCount: 0, failed: false } as never);
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try { await bunNativeWebSocketHandler(state, {} as never).close({ data: { id: 1 } } as never, 1000, "done"); }
    finally { report.mockRestore(); }
    expect(records.at(-1)).toMatchObject({ kind: "websocket-connection", phase: "end", outcome: "error", connectionId: 1 });
  });

  it("terminates a socket that ignores the graceful close", async () => {
    const state = createBunWebSocketRuntimeState({ shutdownGraceMs: 0 });
    const close = vi.fn();
    const terminate = vi.fn();
    const dispose = vi.fn(async () => undefined);
    state.connections.set(1, {
      id: 1, socket: { close, terminate }, scope: { dispose }, ready: Promise.resolve(),
      messages: new Set(), route: { methods: new Map() },
    } as never);
    await bunNativeWebSocketHandler(state, {} as never).shutdown();
    expect(close).toHaveBeenCalledWith(1001, "Server shutting down");
    expect(terminate).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(state.connections.size).toBe(0);
  });
});
