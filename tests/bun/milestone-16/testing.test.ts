import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BunTestClient, RecordingEventDispatcher, RecordingQueueDriver } from "@bunwire/bun/testing";
import type { QueueEnvelope } from "@bunwire/bun";
import { BunOperationObserver } from "../../../packages/bun/src/foundation/observability.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); });

describe("Bun milestone 16 test utilities", () => {
  it("keeps cookie/auth sessions per client and sends an explicit CSRF header", async () => {
    const server = createServer((request, response) => {
      if (request.url === "/login") { response.setHeader("Set-Cookie", "session=alice; HttpOnly; Path=/"); response.end("ok"); return; }
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ cookie: request.headers.cookie ?? null, csrf: request.headers["x-csrf-token"] ?? null }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address.");
    const origin = `http://127.0.0.1:${address.port}`;
    const first = new BunTestClient(origin);
    const second = new BunTestClient(origin);
    await first.request("/login");
    expect(first.cookies.get("session")).toBe("alice");
    expect(second.cookies.size).toBe(0);
    expect(await (await first.csrfRequest("/state", "token-1", { method: "POST" })).json()).toEqual({ cookie: "session=alice", csrf: "token-1" });
    expect(await (await second.request("/state")).json()).toEqual({ cookie: null, csrf: null });
    await expect(first.request("https://other.test/state")).rejects.toThrow(/origin/);
  });

  it("records events and queue submissions only on the owning instances", async () => {
    class RecordedEvent { constructor(readonly id: number) {} }
    const events = new RecordingEventDispatcher();
    const otherEvents = new RecordingEventDispatcher();
    await events.dispatch(new RecordedEvent(1));
    events.assertDispatched(RecordedEvent);
    expect(otherEvents.events).toEqual([]);
    expect(() => events.assertDispatched(RecordedEvent, 2)).toThrow(/observed 1/);
    events.clear();
    expect(events.events).toEqual([]);

    const queue = new RecordingQueueDriver();
    const otherQueue = new RecordingQueueDriver();
    await queue.initialize({ execute: async () => undefined });
    await otherQueue.initialize({ execute: async () => undefined });
    const envelope: QueueEnvelope = { version: 1, id: "j1", job: "test.job", payload: "[]", serializer: { id: "bun.json", version: 1 }, queue: "default", attempts: 0, createdAt: 1, availableAt: 1, policy: { tries: 1, timeout: 1000, backoff: [] } };
    await queue.push(envelope);
    (envelope as { job: string }).job = "mutated";
    queue.assertDispatched("test.job");
    expect(otherQueue.dispatched).toEqual([]);
    expect(() => queue.assertDispatched("other.job")).toThrow(/observed 0/);
    await queue.close();
    await otherQueue.close();
  });

  it("keeps observer failures separate from application results", async () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const observer = new BunOperationObserver(() => { throw new Error("telemetry unavailable"); });
    try {
      await expect(observer.run({ kind: "http", id: "one", requestId: "one" }, async () => "done")).resolves.toBe("done");
      expect(report).toHaveBeenCalledTimes(2);
    } finally { report.mockRestore(); }
  });
});
