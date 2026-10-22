import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUN_COMPILER_DESCRIPTOR } from "@bunwire/bun";
import { aggregateCompilerExtensions, analyzeBunwireProgram, generateRuntimeRegistryModule } from "@bunwire/vite";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtureRoot = path.join(repositoryRoot, "tests/bun/milestone-18/fixtures");
const extensions = aggregateCompilerExtensions(BUN_COMPILER_DESCRIPTOR);

describe("Bun Milestone 18 — signed compiler alias", () => {
  it("resolves the signed alias into a generated middleware definition and attachment", () => {
    const analysis = analyzeBunwireProgram({
      projectRoot: repositoryRoot,
      sourceFiles: [path.join(fixtureRoot, "signed-controller.ts")],
      sourceRoots: [fixtureRoot],
      extensions,
      compilerOptions: { baseUrl: repositoryRoot, paths: {
        "@bunwire/core": ["packages/core/src/index.ts"],
        "@bunwire/bun": ["packages/bun/src/index.ts"],
      } },
    });
    expect(analysis.classes.find(({ name }) => name === "SignedController")?.methods[0]?.middleware[0]?.target.symbolName)
      .toBe("SignedUrlMiddleware");
    const generated = generateRuntimeRegistryModule({
      analysis, extensions, modulePath: path.join(fixtureRoot, "registry.generated.ts"),
    });
    expect(generated.code).toContain("SignedUrlMiddleware");
    expect(generated.code).toContain("defineMiddlewareAttachment");
    expect(generated.code).toContain("defineMiddlewareDefinition");
  });
});
