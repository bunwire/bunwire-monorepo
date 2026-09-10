import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUN_COMPILER_DESCRIPTOR } from "@bunwire/bun";
import { aggregateCompilerExtensions, analyzeBunwireProgram, generateRuntimeRegistryModule } from "@bunwire/vite";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fixture = path.join(root, "tests/fixtures/bun-milestone-07/controller.ts");
const extensions = aggregateCompilerExtensions(BUN_COMPILER_DESCRIPTOR);

describe("Bun Milestone 7 — CSRF compiler contribution", () => {
  it("resolves the canonical built-in csrf alias and emits its runtime definition", () => {
    const analysis = analyzeBunwireProgram({
      projectRoot: root,
      sourceFiles: [fixture],
      sourceRoots: [path.dirname(fixture)],
      extensions,
      compilerOptions: { baseUrl: root, paths: {
        "@bunwire/core": ["packages/core/src/index.ts"],
        "@bunwire/bun": ["packages/bun/src/index.ts"],
      } },
    });
    const controller = analysis.classes.find(({ name }) => name === "SessionController")!;
    expect(controller.methods[0]!.middleware[0]!.target.exportName).toBe("CsrfMiddleware");
    expect(controller.methods[1]!.middleware[0]!.target.exportName).toBe("CsrfMiddleware");
    const middleware = analysis.classes.find(({ name }) => name === "CsrfMiddleware")!;
    expect(middleware.data).toMatchObject({ alias: "csrf", scope: "transient" });
    const generated = generateRuntimeRegistryModule({
      analysis,
      extensions,
      modulePath: path.join(path.dirname(fixture), "registry.generated.ts"),
    });
    expect(generated.code).toContain("CsrfMiddleware");
    expect(generated.code).toContain('"alias": "csrf"');
  });

  it("rejects application middleware that collides with the built-in alias", () => {
    expect(() => analyzeBunwireProgram({
      projectRoot: root,
      sourceFiles: [path.join(path.dirname(fixture), "invalid-collision.ts")],
      sourceRoots: [path.dirname(fixture)],
      extensions,
      compilerOptions: { baseUrl: root, paths: {
        "@bunwire/core": ["packages/core/src/index.ts"],
        "@bunwire/bun": ["packages/bun/src/index.ts"],
      } },
    })).toThrow(/alias.*csrf.*collid/i);
  });
});
