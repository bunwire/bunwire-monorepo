import { describe, expect, it, vi } from "vitest";
import { bunNativeWebSocketHandler, createBunWebSocketRuntimeState, snapshotBunWebSocketIdentity } from "../../../packages/bun/src/websocket/websocket-runtime.js";
import { BunOperationObserver, type BunOperationRecord } from "../../../packages/bun/src/foundation/observability.js";
import { BunExecutionScopeManager } from "../../../packages/bun/src/foundation/execution-scopes.js";
import { Container } from "@bunwire/core";

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
    const manager = new BunExecutionScopeManager(new Container());
    const scope = manager.create("websocket-connection");
    const close = vi.fn();
    const terminate = vi.fn();
    state.connections.set(1, {
      id: 1, socket: { close, terminate }, scope, ready: Promise.resolve(),
      messages: new Set(), route: { methods: new Map() },
    } as never);
    await bunNativeWebSocketHandler(state, manager).shutdown();
    expect(close).toHaveBeenCalledWith(1001, "Server shutting down");
    expect(terminate).toHaveBeenCalledOnce();
    expect(state.connections.size).toBe(0);
    await manager.dispose();
    expect(scope.state).toBe("disposed");
  });

  it("finishes shutdown after grace while a message retains its scope until settlement", async () => {
    const state = createBunWebSocketRuntimeState({ shutdownGraceMs: 0 });
    let closeHookRan = false;
    state.invocation = { invoke: async (_plan: unknown, _args: unknown, options: { around: (context: object, next: () => Promise<void>) => Promise<void> }) =>
      options.around({}, async () => { closeHookRan = true; }) } as never;
    const manager = new BunExecutionScopeManager(new Container());
    const scope = manager.create("websocket-connection");
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const work = manager.run("websocket-message", () => pending, { parent: scope });
    const terminate = vi.fn();
    const connection = { id: 1, socket: { close: vi.fn(), terminate }, scope, ready: Promise.resolve(),
      messages: new Set([work]), route: { path: "/chat", methods: new Map([["close", {}]]) },
      startedAt: performance.now(), messageCount: 1, failed: false };
    state.connections.set(1, connection as never);
    manager.beginShutdown();
    await bunNativeWebSocketHandler(state, manager).shutdown();
    await manager.dispose();
    expect(terminate).toHaveBeenCalledOnce();
    expect(scope.state).toBe("active");
    expect(closeHookRan).toBe(false);
    finish();
    await work;
    await (connection as typeof connection & { closing?: Promise<void> }).closing;
    expect(closeHookRan).toBe(true);
    expect(scope.state).toBe("disposed");
  });

  it("handles late message failure after shutdown without retaining the connection", async () => {
    const state = createBunWebSocketRuntimeState({ shutdownGraceMs: 0 });
    const manager = new BunExecutionScopeManager(new Container());
    const scope = manager.create("websocket-connection");
    let fail!: (error: Error) => void;
    const pending = new Promise<void>((_, reject) => { fail = reject; });
    const work = manager.run("websocket-message", () => pending, { parent: scope });
    // The native handler consumes failures; this mock models that caught work promise.
    const caught = work.catch(() => undefined);
    const connection = { id: 1, socket: { close: vi.fn(), terminate: vi.fn() }, scope, ready: Promise.resolve(),
      messages: new Set([caught]), route: { path: "/chat", methods: new Map() },
      startedAt: performance.now(), messageCount: 1, failed: false };
    state.connections.set(1, connection as never);
    manager.beginShutdown();
    await bunNativeWebSocketHandler(state, manager).shutdown();
    await manager.dispose();
    fail(new Error("late message failure"));
    await caught;
    await (connection as typeof connection & { closing?: Promise<void> }).closing;
    expect(scope.state).toBe("disposed");
    expect(state.connections.size).toBe(0);
  });
});
