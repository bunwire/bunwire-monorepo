import { describe, expect, it } from "vitest";
import {
  BUN_COMMAND_HANDLE_KIND, BUN_COMMAND_KIND, BUN_HTTP_ROUTE_KIND, BUN_JOB_HANDLE_KIND, BUN_JOB_KIND,
  BUN_PAGE_PROTOCOL_VERSION, BUN_REQUEST_KIND, BUN_SCHEDULED_TASK_KIND, BUN_WEBSOCKET_KIND,
  BunAdapter, JsonJobSerializer, MemoryQueueDriver, MemorySessionStore,
} from "@bunwire/bun";
import registry from "../../../examples/bun-app/.bunwire/registry.js";
import { snapshotEnvelope } from "../../../packages/bun/src/queue-driver.js";
import manifest from "../../../examples/bun-app/.bunwire/pages.js";
import bunPackage from "../../../packages/bun/package.json" with { type: "json" };

describe("Bun milestone 16 compatibility boundary", () => {
  it("keeps canonical public kind IDs and explicit runtime roles", () => {
    expect({
      http: BUN_HTTP_ROUTE_KIND.id, request: BUN_REQUEST_KIND.id,
      job: BUN_JOB_KIND.id, jobHandle: BUN_JOB_HANDLE_KIND.id,
      schedule: BUN_SCHEDULED_TASK_KIND.id, command: BUN_COMMAND_KIND.id,
      commandHandle: BUN_COMMAND_HANDLE_KIND.id, websocket: BUN_WEBSOCKET_KIND.id,
    }).toEqual({ http: "bun.http-route", request: "bun.request", job: "bun.job", jobHandle: "bun.job.handle",
      schedule: "bun.scheduled-task", command: "bun.command", commandHandle: "bun.command.handle", websocket: "bun.websocket" });
    for (const role of ["http", "worker", "scheduler", "command"] as const) expect(() => new BunAdapter({ role,
      ...(role === "worker" ? { queues: { driver: new MemoryQueueDriver() } } : {}) })).not.toThrow();
    expect(() => new BunAdapter({ role: "server" as "http" })).toThrow(/role must be one of/);
  });

  it("retains generated registry and persisted queue/page versions", () => {
    expect(Object.keys(registry).sort()).toEqual(["classAttachments", "classes", "eventAliases", "events", "methods", "providers", "schedules"]);
    expect(registry.classes.length).toBeGreaterThan(0);
    expect(registry.methods.some((plan) => plan.kind === BUN_HTTP_ROUTE_KIND)).toBe(true);
    expect(registry.classes.some((entry) => entry.kind === BUN_WEBSOCKET_KIND)).toBe(true);
    const serializer = new JsonJobSerializer();
    expect({ id: serializer.id, version: serializer.version }).toEqual({ id: "bun.json", version: 1 });
    const envelope = snapshotEnvelope({ version: 1, id: "frozen", job: "example.record-action", payload: "[]",
      serializer: { id: serializer.id, version: serializer.version }, queue: "default", attempts: 0,
      createdAt: 0, availableAt: 0, policy: { tries: 1, backoff: [] } });
    expect(envelope.version).toBe(1);
    expect(BUN_PAGE_PROTOCOL_VERSION).toBe(1);
    expect(manifest.protocol).toBe(BUN_PAGE_PROTOCOL_VERSION);
  });

  it("exposes only intentional package entrypoints and a concrete session store contract", () => {
    expect(Object.keys(bunPackage.exports).sort()).toEqual([".", "./client", "./react", "./react/server", "./testing"]);
    const store = new MemorySessionStore();
    expect(["read", "write", "destroy"].every((method) => typeof store[method as "read"] === "function")).toBe(true);
  });
});
