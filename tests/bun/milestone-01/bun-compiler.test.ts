import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  analyzeBunwireApplication,
  generateCallerContractModule,
} from "@bunwire/vite";

describe("Bun Milestone 1 — compiler and generated-registry integration", () => {
  it("discovers BunAdapter's compiler descriptor from the bootstrap", async () => {
    const root = path.join(fileURLToPath(new URL("../../../", import.meta.url)), "examples/bun-app");
    const application = await analyzeBunwireApplication({ root });

    expect(application.extensions.adapter.id).toBe("bun.adapter");
    expect(application.extensions.adapter.classKinds.map(({ id }) => id)).toEqual([
      "bun.request",
      "bun.job",
      "bun.scheduled-task",
      "bun.command",
    ]);
    expect(application.extensions.adapter.methodKinds.map(({ id }) => id)).toEqual([
      "bun.http-route",
      "bun.job.handle",
      "bun.scheduled-task.handle",
      "bun.command.handle",
    ]);
    expect(application.analysis.classes.map(({ name }) => name).sort()).toEqual([
      "CsrfMiddleware",
      "AuthenticateMiddleware",
      "GuestMiddleware",
      "AuthorizeMiddleware",
      "EchoNormalizer",
      "EchoRequest",
      "HomeController",
      "ExampleHttpMiddleware",
      "ExampleGuardMiddleware",
      "ExampleActionRecorded",
      "ExampleEventAudit",
      "RecordExampleAction",
      "ExampleQueuedAudit",
      "QueueExampleAction",
      "ExampleJobAudit",
      "RecordExampleJob",
    ].sort());
  });

  it("generates a deterministic empty client contract for server-only Bun HTTP methods", async () => {
    const root = path.join(fileURLToPath(new URL("../../../", import.meta.url)), "examples/bun-app");
    const application = await analyzeBunwireApplication({ root });
    const generated = generateCallerContractModule({
      analysis: application.analysis,
      extensions: application.extensions,
      modulePath: path.join(root, ".bunwire", "client.ts"),
    });

    expect(generated.code).toContain("export interface BunwireRequestContract {}");
    expect(generated.code).toContain("export interface BunwireMessageContract {}");
    expect(generated.code).not.toContain("createBunwireClient");
    expect(generated.hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
