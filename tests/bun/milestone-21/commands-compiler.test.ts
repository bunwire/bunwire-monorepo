import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUN_COMMAND_KIND, BUN_COMPILER_DESCRIPTOR, Command } from "@bunwire/bun";
import { aggregateCompilerExtensions, analyzeBunwireProgram, generateRuntimeRegistryModule } from "@bunwire/vite";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fixture = path.join(root, "tests/bun/milestone-21/fixtures/command.ts");
const extensions = aggregateCompilerExtensions(BUN_COMPILER_DESCRIPTOR);

describe("Bun Milestone 21 — command metadata", () => {
  it("compiles examples and parameter help details into generated registry metadata", () => {
    const analysis = analyzeBunwireProgram({ projectRoot: root, sourceFiles: [fixture], bootstrapPath: fixture,
      sourceRoots: [path.dirname(fixture)], extensions,
      compilerOptions: { experimentalDecorators: true, baseUrl: root, paths: {
        "@bunwire/core": ["packages/core/src/index.ts"], "@bunwire/bun": ["packages/bun/src/index.ts"],
      } },
    });
    const command = analysis.classes.find((entry) => entry.kind === BUN_COMMAND_KIND)!;
    expect(command.data).toMatchObject({ name: "reports:build", examples: ["bunwire reports:build staff --format csv"] });
    expect(command.methods[0]!.parameters.map((entry) => "data" in entry ? entry.data : undefined)).toMatchObject([
      { kind: "argument", name: "team", choices: ["staff", "guests"] },
      { kind: "option", name: "format", alias: "f", default: "json" },
      { kind: "flag", name: "verbose", alias: "v" },
    ]);
    const generated = generateRuntimeRegistryModule({ analysis, extensions, modulePath: path.join(root, "output/command-21.generated.ts") });
    expect(generated.code).toContain("bunwire reports:build staff --format csv");
    expect(generated.code).toContain("reports:build");
  });

  it("rejects invalid declared examples", () => {
    for (const examples of [[], [""], ["two\nlines"], [42]]) {
      expect(() => Command.definition.createMetadata({ name: "invalid", examples } as never)).toThrow();
    }
  });
});
