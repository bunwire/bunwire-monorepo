import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUN_COMPILER_DESCRIPTOR, Queue } from "@bunwire/bun";
import { LISTENER_KIND } from "@bunwire/core";
import { aggregateCompilerExtensions, analyzeBunwireProgram, generateRuntimeRegistryModule, generateCallerContractModule } from "@bunwire/vite";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixtures = path.join(root, "tests/fixtures/bun-milestone-12-listeners");
const extensions = aggregateCompilerExtensions(BUN_COMPILER_DESCRIPTOR);
function analyze(file: string) { return analyzeBunwireProgram({ projectRoot: root, sourceFiles: [path.join(fixtures, file)], extensions,
  compilerOptions: { baseUrl: root, paths: { "@bunwire/core": ["packages/core/src/index.ts"], "@bunwire/bun": ["packages/bun/src/index.ts"] } } }); }
describe("Bun queued-listener compilation", () => {
  it("reuses canonical Core listeners, recognizes re-exports/both orders and emits policy sidecars without caller contracts", () => {
    const analysis = analyze("valid.ts"); const listeners = analysis.classes.filter((entry) => entry.kind === LISTENER_KIND);
    expect(listeners).toHaveLength(2); expect(listeners[0]!.attachments![0]!.definition).toBe(Queue.definition);
    expect(listeners.map((entry) => entry.attachments![0]!.data)).toEqual([{ id: "first", queue: "default", tries: 1, backoff: [] }, { id: "second", queue: "notifications", tries: 3, timeout: 100, backoff: [10, 30] }]);
    expect(listeners[0]!.constructor!.dependencies[0]!.token.symbolName).toBe("BUN_JOB_CONTEXT");
    const options = { analysis, extensions, modulePath: path.join(fixtures, "generated.ts") }; const generated = generateRuntimeRegistryModule(options);
    expect(generated.code).toContain("defineListenerDefinition({"); expect(generated.code).toContain("classAttachments: ["); expect(generated.code).toContain("defineManagedClassAttachment({");
    expect(generateRuntimeRegistryModule(options).code).toBe(generated.code); expect(generateCallerContractModule(options).code).not.toContain("first");
  });
  it("rejects shared job/listener IDs", () => {
    expect(() => generateRuntimeRegistryModule({ analysis: analyze("duplicate.ts"), extensions, modulePath: path.join(fixtures, "generated.ts") })).toThrow(/duplicate identity "same"/);
  });
  it.each([["invalid-policy.ts", "DECORATOR_ARGUMENT_INVALID"], ["fake.ts", "DECORATOR_IDENTITY_CONFLICT"]])("rejects %s", (file, code) => {
    expect(() => analyze(file!)).toThrowError(expect.objectContaining({ code }));
  });
});
