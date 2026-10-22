import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUN_COMPILER_DESCRIPTOR } from "@bunwire/bun";
import { aggregateCompilerExtensions, analyzeBunwireProgram, generateRuntimeRegistryModule } from "@bunwire/vite";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtureRoot = path.join(repositoryRoot, "tests/bun/milestone-20/fixtures");
const extensions = aggregateCompilerExtensions(BUN_COMPILER_DESCRIPTOR);

describe("Bun Milestone 20 — throttle compiler alias", () => {
  it("resolves a named policy into a generated middleware definition and attachment", () => {
    const analysis = analyzeBunwireProgram({
      projectRoot: repositoryRoot,
      sourceFiles: [path.join(fixtureRoot, "throttle-controller.ts")],
      bootstrapPath: path.join(fixtureRoot, "bootstrap.ts"),
      sourceRoots: [fixtureRoot],
      extensions,
      compilerOptions: { baseUrl: repositoryRoot, paths: {
        "@bunwire/core": ["packages/core/src/index.ts"],
        "@bunwire/bun": ["packages/bun/src/index.ts"],
      } },
    });
    const attachments = analysis.classes.find(({ name }) => name === "ThrottleController")?.methods[0]?.middleware;
    expect(attachments?.map((entry) => [entry.target.symbolName, [...entry.parameters]])).toEqual([
      ["ThrottleMiddleware", ["global"]],
      ["ThrottleMiddleware", ["api"]],
    ]);
    const generated = generateRuntimeRegistryModule({
      analysis, extensions, modulePath: path.join(fixtureRoot, "registry.generated.ts"),
    });
    expect(generated.code).toContain("ThrottleMiddleware");
    expect(generated.code).toContain('"api"');
    expect(generated.code).toContain("defineMiddlewareDefinition");
  });
});
