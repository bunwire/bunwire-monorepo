import { Container } from "@bunwire/core";
import { describe, expect, it, vi } from "vitest";
import { BunExecutionScopeManager } from "../../../packages/bun/src/foundation/execution-scopes.js";
import {
  BUN_WEBSOCKET_CHANNELS, BunWebSocketMalformedMessageError, defineBunWebSocketMessages,
  type BunWebSocketChannels,
} from "../../../packages/bun/src/websocket/websocket-conveniences.js";
import { bunNativeWebSocketHandler, createBunWebSocketRuntimeState } from "../../../packages/bun/src/websocket/websocket-runtime.js";

const messages = defineBunWebSocketMessages({
  chat: (value: unknown): value is { text: string } => typeof value === "object" && value !== null
    && typeof (value as { text?: unknown }).text === "string",
});

describe("Milestone 23 typed WebSocket envelopes", () => {
  it("validates named payloads on decode and encode", () => {
    expect(messages.decode('{"type":"chat","payload":{"text":"hi"}}')).toEqual({ type: "chat", payload: { text: "hi" } });
    expect(messages.encode("chat", { text: "hi" })).toBe('{"type":"chat","payload":{"text":"hi"}}');
    expect(() => messages.encode("chat", { text: 1 } as never)).toThrow(/invalid payload/);
    const acceptsUndefined = defineBunWebSocketMessages({ empty: (value: unknown): value is undefined => value === undefined });
    expect(() => acceptsUndefined.encode("empty", undefined)).toThrow(/survive JSON encoding/);
  });

  it.each(["not json", "[]", '{"type":"other","payload":{}}', '{"type":"chat","payload":{}}',
    '{"type":"chat","payload":{"text":"hi"},"extra":1}', Buffer.from("binary")])(
    "rejects malformed or binary envelopes %#", (raw) => {
      expect(() => messages.decode(raw)).toThrow(BunWebSocketMalformedMessageError);
    });
});

function fixture(options: Parameters<typeof createBunWebSocketRuntimeState>[0]) {
  const state = createBunWebSocketRuntimeState(options);
  const manager = new BunExecutionScopeManager(new Container());
  const handler = bunNativeWebSocketHandler(state, manager);
  const sockets = new Map<number, ReturnType<typeof socket>>();
  function socket(id: number) {
    const subscriptions = new Set<string>();
    return {
      data: { id }, subscriptions,
      subscribe: vi.fn((channel: string) => { subscriptions.add(channel); return true; }),
      unsubscribe: vi.fn((channel: string) => subscriptions.delete(channel)),
      send: vi.fn(() => 2), publish: vi.fn(() => 4), close: vi.fn(), terminate: vi.fn(),
    };
  }
  function open(id: number, identity = { userId: `user-${id}` }) {
    state.pending.set(id, { route: { path: "/chat", entry: { target: class Socket {}, dependencies: [] }, methods: new Map() },
      identity, params: Object.freeze({ room: "one" }) } as never);
    const ws = socket(id);
    sockets.set(id, ws);
    handler.open(ws as never);
    const connection = state.connections.get(id) as never as { scope: { resolve: (token: unknown) => unknown } };
    return { ws, channels: connection.scope.resolve(BUN_WEBSOCKET_CHANNELS) as BunWebSocketChannels };
  }
  return { state, manager, handler, open, sockets };
}

describe("Milestone 23 channel helpers", () => {
  it("denies joins without a policy and leaves the socket open", async () => {
    const app = fixture({});
    const first = app.open(1);
    expect(await first.channels.join("room:one")).toBe(false);
    expect(first.ws.subscribe).not.toHaveBeenCalled();
    expect(first.ws.close).not.toHaveBeenCalled();
    await app.handler.close(first.ws as never, 1000, "done");
    await app.manager.dispose();
  });

  it("isolates authorized membership and reports native delivery outcomes", async () => {
    const authorizeChannel = vi.fn(({ channel, identity }: { channel: string; identity: unknown }) =>
      channel === "room:one" && (identity as { userId?: string } | undefined)?.userId === "user-1");
    const app = fixture({ authorizeChannel, maxChannelsPerConnection: 1 });
    const first = app.open(1);
    const second = app.open(2);
    expect(await first.channels.join("room:one")).toBe(true);
    expect(await second.channels.join("room:one")).toBe(false);
    expect(first.channels.broadcast("room:one", "hello")).toEqual({ status: "sent", bytes: 4 });
    expect(second.channels.broadcast("room:one", "hello")).toEqual({ status: "missing" });
    expect(first.channels.send(2, "direct")).toEqual({ status: "sent", bytes: 2 });
    expect(second.ws.send).toHaveBeenCalledWith("direct");
    second.ws.send.mockReturnValueOnce(-1);
    expect(first.channels.send(2, "slow")).toEqual({ status: "backpressure" });
    first.ws.publish.mockReturnValueOnce(0);
    expect(first.channels.broadcast("room:one", "none")).toEqual({ status: "dropped" });
    first.ws.publish.mockReturnValueOnce(-1);
    expect(first.channels.broadcast("room:one", "slow-room")).toEqual({ status: "backpressure" });
    await expect(first.channels.join("invalid channel")).rejects.toThrow();
    await expect(first.channels.join("room:two")).rejects.toThrow(/channel limit/);
    expect(authorizeChannel).toHaveBeenCalledWith(expect.objectContaining({ identity: { userId: "user-1" },
      connection: expect.objectContaining({ id: 1, path: "/chat" }) }));
    await app.handler.close(second.ws as never, 1000, "done");
    expect(first.channels.send(2, "gone")).toEqual({ status: "missing" });
    await app.handler.close(first.ws as never, 1000, "done");
    expect(first.ws.unsubscribe).toHaveBeenCalledWith("room:one");
    await app.manager.dispose();
  });

  it("cleans subscriptions on forced shutdown", async () => {
    const app = fixture({ authorizeChannel: () => true, shutdownGraceMs: 0 });
    const first = app.open(1);
    expect(await first.channels.join("room:one")).toBe(true);
    await app.handler.shutdown();
    expect(first.ws.unsubscribe).toHaveBeenCalledWith("room:one");
    expect(first.channels.broadcast("room:one", "late")).toEqual({ status: "missing" });
    await app.manager.dispose();
  });
});
