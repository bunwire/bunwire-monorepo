import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  analyzeBunwireApplication,
  generateCallerContractModule,
} from "@bunwire/vite";

describe("Bun Milestone 1 — compiler and generated-registry integration", () => {
  it("discovers BunAdapter's empty compiler descriptor from the bootstrap", async () => {
    const root = path.join(fileURLToPath(new URL("../../../", import.meta.url)), "examples/bun-app");
    const application = await analyzeBunwireApplication({ root });

    expect(application.extensions.adapter.id).toBe("bun.adapter");
    expect(application.extensions.adapter.classKinds).toEqual([]);
    expect(application.extensions.adapter.methodKinds).toEqual([]);
    expect(application.analysis.classes).toEqual([]);
  });

  it("generates a deterministic empty client contract when an adapter has no method kinds", async () => {
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
