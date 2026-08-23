import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { defineAdapterCompilerDescriptor } from "@bunwire/core";
import {
  aggregateCompilerExtensions,
  analyzeBunwireProgram,
  generateRuntimeRegistryModule,
} from "@bunwire/vite";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/milestone-12b-middleware");
const generatedPath = path.join(fixtureRoot, "never-execute.generated.ts");
const extensions = aggregateCompilerExtensions(
  defineAdapterCompilerDescriptor({ id: "fixture.middleware-class-invalid" }),
);

function analyze(...files: readonly string[]) {
  return analyzeBunwireProgram({
    projectRoot: repositoryRoot,
    sourceFiles: files.map((file) => path.join(fixtureRoot, file)),
    extensions,
    compilerOptions: {
      baseUrl: repositoryRoot,
      paths: { "@bunwire/core": ["packages/core/src/index.ts"] },
    },
  });
}

function expectFailure(file: string, code: string, message: RegExp): void {
  try {
    analyze(file);
  } catch (error) {
    expect(error).toMatchObject({
      code,
      message: expect.stringMatching(message),
      location: expect.objectContaining({ line: expect.any(Number), column: expect.any(Number) }),
    });
    return;
  }
  throw new Error(`Expected ${file} to fail with ${code}.`);
}

describe("Middleware Redesign 12B — class and constructor diagnostics", () => {
  it.each([
    ["invalid-class-anonymous.ts", "MANAGED_CLASS_INVALID", /stable declared name/i],
    ["invalid-class-unexported.ts", "MIDDLEWARE_CLASS_INVALID", /must be exported directly/i],
    ["invalid-class-abstract.ts", "MIDDLEWARE_CLASS_INVALID", /must be concrete/i],
    ["invalid-handle-missing.ts", "MIDDLEWARE_CLASS_INVALID", /concrete callable instance handle/i],
    ["invalid-handle-static.ts", "MIDDLEWARE_CLASS_INVALID", /concrete callable instance handle/i],
    ["invalid-handle-declaration.ts", "MIDDLEWARE_CLASS_INVALID", /concrete callable instance handle/i],
  ] as const)("rejects invalid middleware shape in %s", (file, code, message) => {
    expectFailure(file, code, message);
  });

  it.each([
    ["invalid-constructor-plain.ts", /not an injectable managed class.*@Inject/i],
    ["invalid-constructor-interface.ts", /not an injectable managed class.*@Inject/i],
    ["invalid-inherited-constructor.ts", /inherits a constructor with parameters.*forwarding constructor/i],
  ] as const)("applies managed constructor policy to %s", (file, message) => {
    expectFailure(file, "CONSTRUCTOR_INJECTION_INVALID", message);
  });

  it("includes middleware in managed constructor cycle validation", () => {
    expectFailure(
      "invalid-constructor-cycle.ts",
      "CONSTRUCTOR_DEPENDENCY_CYCLE",
      /FirstCycleMiddleware -> SecondCycleMiddleware -> FirstCycleMiddleware/i,
    );
  });

  it("never imports, constructs, initializes, or invokes middleware", () => {
    const analysis = analyze("valid/no-execute.ts");
    expect(analysis.classes.map(({ name }) => name)).toEqual(["NeverExecuteMiddleware"]);
    expect(() => generateRuntimeRegistryModule({
      analysis,
      extensions,
      modulePath: generatedPath,
    })).not.toThrow();
  });
});
