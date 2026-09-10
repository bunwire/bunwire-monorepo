import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { aggregateCompilerExtensions, analyzeBunwireProgram, generateRuntimeRegistryModule, generateCallerContractModule } from "@bunwire/vite";
import { compiler, Mark } from "../fixtures/milestone-14-attachments/adapter.js";
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixtures = path.join(root, "tests/fixtures/milestone-14-attachments");
const extensions = aggregateCompilerExtensions(compiler);
function analyze(file: string) { return analyzeBunwireProgram({ projectRoot: root, sourceFiles: [path.join(fixtures, file)], extensions,
  compilerOptions: { baseUrl: root, paths: { "@bunwire/core": ["packages/core/src/index.ts"], "proof-attachments": ["tests/fixtures/milestone-14-attachments/adapter.ts"] } } }); }
describe("generic class attachment compilation with an unrelated adapter", () => {
  it("recognizes canonical definitions in both orders and emits deterministic supplementary records", () => {
    const analysis = analyze("valid.ts"); const attached = analysis.classes.filter((entry) => entry.attachments?.length);
    expect(attached.map((entry) => entry.attachments![0]!.data)).toEqual([{ id: "first" }, { id: "second" }]);
    expect(attached.every((entry) => entry.attachments![0]!.definition === Mark.definition)).toBe(true);
    const options = { analysis, extensions, modulePath: path.join(fixtures, "generated.ts") };
    const generated = generateRuntimeRegistryModule(options); expect(generated.code).toContain("classAttachments: ["); expect(generated.code).toContain("defineManagedClassAttachment({ target:");
    expect(generateRuntimeRegistryModule(options).code).toBe(generated.code);
    expect(generateCallerContractModule(options).code).not.toContain("proof.mark");
  });
  it("validates identities across distinct managed kinds and attachment data", () => {
    expect(() => generateRuntimeRegistryModule({ analysis: analyze("duplicate.ts"), extensions, modulePath: path.join(fixtures, "generated.ts") })).toThrow(/duplicate identity "shared"/);
  });
  it.each([["duplicate-attachment.ts", "CLASS_ATTACHMENT_INVALID"], ["plain.ts", "CLASS_ATTACHMENT_INVALID"], ["method.ts", "CLASS_ATTACHMENT_INVALID"],
    ["inherited.ts", "CLASS_ATTACHMENT_INVALID"], ["wrong-kind.ts", "CLASS_ATTACHMENT_INVALID"], ["fake.ts", "DECORATOR_IDENTITY_CONFLICT"], ["nonliteral.ts", "DECORATOR_ARGUMENT_INVALID"]])("rejects %s without running application code", (file, code) => {
    expect(() => analyze(file!)).toThrowError(expect.objectContaining({ code, location: expect.objectContaining({ line: expect.any(Number) }) }));
  });
});
