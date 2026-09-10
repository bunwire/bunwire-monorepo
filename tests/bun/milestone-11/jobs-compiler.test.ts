import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUN_COMPILER_DESCRIPTOR, BUN_JOB_KIND, BUN_JOB_HANDLE_KIND } from "@bunwire/bun";
import { aggregateCompilerExtensions, analyzeBunwireProgram, generateRuntimeRegistryModule, generateCallerContractModule } from "@bunwire/vite";
import { compiler as fakeCompiler, PERFORM_KIND } from "../../fixtures/bun-milestone-11/fake-adapter.js";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = path.join(root, "tests/fixtures/bun-milestone-11");
const extensions = aggregateCompilerExtensions(BUN_COMPILER_DESCRIPTOR);
function analyze(file: string) {
  return analyzeBunwireProgram({ projectRoot: root, sourceFiles: [path.join(fixture, file)], extensions,
    compilerOptions: { baseUrl: root, paths: { "@bunwire/core": ["packages/core/src/index.ts"], "@bunwire/bun": ["packages/bun/src/index.ts"] } } });
}
describe("Bun Milestone 11 compiler", () => {
  it("supports an unrelated adapter's intrinsic method and literal policy without Bun semantics", () => {
    const fakeExtensions = aggregateCompilerExtensions(fakeCompiler);
    const analysis = analyzeBunwireProgram({ projectRoot: root, sourceFiles: [path.join(fixture, "fake-valid.ts")], extensions: fakeExtensions,
      compilerOptions: { baseUrl: root, paths: { "@bunwire/core": ["packages/core/src/index.ts"], "test-intrinsic": ["tests/fixtures/bun-milestone-11/fake-adapter.ts"] } } });
    const task = analysis.classes.find((entry) => entry.name === "TaskExample")!;
    expect(task.data).toEqual({ type: "proof", priority: 7 }); expect(task.methods[0]!.kind).toBe(PERFORM_KIND);
    expect(generateRuntimeRegistryModule({ analysis, extensions: fakeExtensions, modulePath: path.join(fixture, "fake.generated.ts") }).code).toContain('method: "perform"');
  });
  it("generates canonical transient jobs, constructor DI, literal defaults and intrinsic payload plans without clients", () => {
    const analysis = analyze("src/jobs.ts");
    const job = analysis.classes.find((entry) => entry.name === "AuditJob")!;
    expect(job.kind).toBe(BUN_JOB_KIND);
    expect(job.scope).toBe("transient");
    expect(job.data).toEqual({ id: "test.audit", queue: "audit", tries: 3, timeout: 5000, backoff: [0, 100] });
    expect(job.constructor?.dependencies.map((entry) => entry.token.symbolName)).toEqual(["Audit", "BUN_EXECUTION_SCOPE"]);
    expect(job.methods[0]?.kind).toBe(BUN_JOB_HANDLE_KIND);
    expect(job.methods[0]?.minimumCallerArguments).toBe(1);
    expect(job.methods[0]?.maximumCallerArguments).toBeNull();
    const defaults = analysis.classes.find((entry) => entry.name === "DefaultsJob")!;
    expect(defaults.data).toEqual({ id: "test.defaults", queue: "default", tries: 1, backoff: [] });
    expect(defaults.methods[0]!.minimumCallerArguments).toBe(0);
    expect(defaults.methods[0]!.maximumCallerArguments).toBe(1);
    const modulePath = path.join(fixture, "generated.ts");
    const registry = generateRuntimeRegistryModule({ analysis, extensions, modulePath });
    expect(registry.code).toContain('method: "handle"');
    expect(registry.code).toContain('scope: "transient"');
    expect(registry.code).toContain('BUN_JOB_HANDLE_KIND');
    const client = generateCallerContractModule({ analysis, extensions, modulePath });
    expect(client.code).not.toContain("test.audit");
  });
  it.each([["invalid.ts", /tries/], ["null-policy.ts", /Queue name/], ["constructor-policy.ts", /constructor assignments/], ["injected-token.ts", /payload-only/], ["injected.ts", /payload-only/], ["overload.ts", /non-overloaded/], ["fake.ts", /canonical|registered/]] as const)("rejects %s", (file, message) => {
    expect(() => analyze(file)).toThrow(message);
  });
  it("rejects duplicate stable identities", () => {
    expect(() => generateRuntimeRegistryModule({ analysis: analyze("duplicate.ts"), extensions, modulePath: path.join(fixture, "generated.ts") })).toThrow(/duplicate identity/);
  });
});
