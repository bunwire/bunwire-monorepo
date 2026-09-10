import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUN_COMPILER_DESCRIPTOR,
  BUN_FORM_REQUEST_RESOLVER_ID,
  BUN_REQUEST_KIND,
  Request,
} from "@bunwire/bun";
import {
  aggregateCompilerExtensions,
  analyzeBunwireProgram,
  generateCallerContractModule,
  generateRuntimeRegistryModule,
} from "@bunwire/vite";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/bun-milestone-06");
const extensions = aggregateCompilerExtensions(BUN_COMPILER_DESCRIPTOR);

function analyze(file = "valid.ts") {
  return analyzeBunwireProgram({
    projectRoot: repositoryRoot,
    sourceFiles: [path.join(fixtureRoot, file)],
    extensions,
    compilerOptions: {
      baseUrl: repositoryRoot,
      experimentalDecorators: true,
      paths: {
        "@bunwire/core": ["packages/core/src/index.ts"],
        "@bunwire/bun": ["packages/bun/src/index.ts"],
        "@bunwire/validation": ["packages/validation/src/index.ts"],
      },
    },
  });
}

describe("Bun Milestone 6 — Form Request compiler", () => {
  it("registers the canonical Request kind and compiles exact request resolution", () => {
    expect(extensions.classKinds).toContain(BUN_REQUEST_KIND);
    expect(extensions.classDecorators).toContain(Request.definition);
    const analysis = analyze();
    const request = analysis.classes.find(({ name }) => name === "CreateUserRequest");
    const controller = analysis.classes.find(({ name }) => name === "UserController");
    expect(request?.kind).toBe(BUN_REQUEST_KIND);
    expect(request?.constructor?.dependencies[0]?.token.symbolName).toBe("RequestService");
    expect(controller?.methods[0]?.parameters).toEqual([
      expect.objectContaining({
        source: "resolver",
        methodIndex: 0,
        resolverId: BUN_FORM_REQUEST_RESOLVER_ID,
        token: expect.objectContaining({ symbolName: "CreateUserRequest" }),
      }),
    ]);

    const registry = generateRuntimeRegistryModule({
      analysis,
      extensions,
      modulePath: path.join(fixtureRoot, "registry.generated.ts"),
    });
    expect(registry.code).toMatch(/import \{ Request as .* \} from "@bunwire\/bun";/);
    expect(registry.code).toMatch(
      /kind: .*\.definition\.kind, target: __bunwire_import_\d+, data: \{ "type": "request" \}/,
    );
    expect(registry.code).toContain('createParameterResolverId("bun.form-request")');
    expect(registry.code).toMatch(/token: __bunwire_import_\d+/);

    const client = generateCallerContractModule({
      analysis,
      extensions,
      modulePath: path.join(fixtureRoot, "client.generated.ts"),
    });
    expect(client.code).toContain("export interface BunwireRequestContract {}");
  });

  it("rejects undecorated, invalid-base, and counterfeit Request classes", () => {
    expect(() => analyze("invalid-undecorated.ts")).toThrowError(expect.objectContaining({
      code: "MANAGED_METHOD_INVALID",
      message: expect.stringMatching(/missing its canonical managed-class decorator/i),
    }));
    expect(() => analyze("invalid-base.ts")).toThrowError(expect.objectContaining({
      code: "MANAGED_CLASS_INVALID",
      message: expect.stringMatching(/must extend the canonical base contract/i),
    }));
    expect(() => analyze("invalid-counterfeit.ts")).toThrowError(expect.objectContaining({
      code: "DECORATOR_IDENTITY_CONFLICT",
      message: expect.stringMatching(/bun\.request\.decorator.*not the canonical/i),
    }));
  });
});
