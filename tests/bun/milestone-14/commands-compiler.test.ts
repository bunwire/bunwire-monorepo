import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUN_COMMAND_HANDLE_KIND, BUN_COMMAND_KIND, BUN_COMPILER_DESCRIPTOR } from "@bunwire/bun";
import { aggregateCompilerExtensions, analyzeBunwireProgram, generateCallerContractModule, generateRuntimeRegistryModule } from "@bunwire/vite";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = path.join(root, "tests/fixtures/bun-milestone-14");
const extensions = aggregateCompilerExtensions(BUN_COMPILER_DESCRIPTOR);
function analyze(file: string) { const source = path.join(fixture, file); return analyzeBunwireProgram({ projectRoot: root, sourceFiles: [source], bootstrapPath: source, sourceRoots: [fixture], extensions,
  compilerOptions: { experimentalDecorators: true, baseUrl: root, paths: { "@bunwire/core": ["packages/core/src/index.ts"], "@bunwire/bun": ["packages/bun/src/index.ts"] } } }); }

describe("Bun command compilation", () => {
  it("generates canonical command identity, DI and parameter resolver plans", () => {
    const analysis = analyze("valid.ts"); const command = analysis.classes.find((entry) => entry.kind === BUN_COMMAND_KIND)!;
    expect(command.data).toEqual({ name: "users:cleanup", description: "Remove inactive users." }); expect(command.scope).toBe("transient"); expect(command.constructor?.dependencies).toHaveLength(1);
    expect(command.methods).toHaveLength(1); expect(command.methods[0]!.kind).toBe(BUN_COMMAND_HANDLE_KIND); expect(command.methods[0]!.parameters.map((entry) => entry.source)).toEqual(["resolver", "resolver", "resolver"]);
    expect(command.methods[0]!.parameters.map((entry) => "data" in entry ? entry.data : undefined)).toMatchObject([{ kind: "argument", name: "team" }, { kind: "option", name: "days", default: 30 }, { kind: "flag", name: "force" }]);
    const generated = generateRuntimeRegistryModule({ analysis, extensions, modulePath: path.join(fixture, ".generated/registry.ts") });
    expect(generated.code).toContain('createParameterResolverId("bun.command-argument")'); expect(generated.code).toContain("BUN_COMMAND_HANDLE_KIND");
    expect(generateCallerContractModule({ analysis, extensions, modulePath: path.join(fixture, ".generated/client.ts") }).code).not.toContain("users:cleanup");
    expect(generateRuntimeRegistryModule({ analysis, extensions, modulePath: path.join(fixture, ".generated/registry.ts") }).code).toBe(generated.code);
  });
  it.each([
    ["duplicate.ts", /duplicate identity/], ["reserved.ts", /reserved identity/], ["invalid-parameter.ts", /declared framework parameter resolvers/], ["duplicate-input.ts", /Duplicate command input name/],
  ])("rejects invalid command fixture %s", (file, message) => expect(() => { const analysis = analyze(file); generateRuntimeRegistryModule({ analysis, extensions, modulePath: path.join(fixture, ".generated/registry.ts") }); }).toThrowError(expect.objectContaining({ message: expect.stringMatching(message) })));
  it("ignores a fake local decorator", () => expect(analyze("fake.ts").classes.some((entry) => entry.kind === BUN_COMMAND_KIND)).toBe(false));
});
