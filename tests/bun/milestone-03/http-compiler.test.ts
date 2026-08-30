import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUN_COMPILER_DESCRIPTOR,
  BUN_HTTP_CONTEXT_RESOLVER_ID,
  BUN_HTTP_ROUTE_KIND,
  Context,
  Delete,
  Get,
  Head,
  Options,
  Patch,
  Post,
  Put,
} from "@bunwire/bun";
import { CONTROLLER_KIND } from "@bunwire/core";
import {
  aggregateCompilerExtensions,
  analyzeBunwireProgram,
  generateCallerContractModule,
  generateRuntimeRegistryModule,
} from "@bunwire/vite";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/bun-milestone-03");
const extensions = aggregateCompilerExtensions(BUN_COMPILER_DESCRIPTOR);

function analyze(file = "valid.ts") {
  return analyzeBunwireProgram({
    projectRoot: repositoryRoot,
    sourceFiles: [path.join(fixtureRoot, file)],
    extensions,
    compilerOptions: {
      baseUrl: repositoryRoot,
      paths: {
        "@bunwire/core": ["packages/core/src/index.ts"],
        "@bunwire/bun": ["packages/bun/src/index.ts"],
      },
    },
  });
}

function expectAnalyzeFailure(file: string, code: string, message: RegExp): void {
  expect(() => analyze(file)).toThrowError(expect.objectContaining({
    code,
    message: expect.stringMatching(message),
  }));
}

describe("Bun Milestone 3 — HTTP compiler metadata", () => {
  it("registers exact canonical symbols on Core's Controller kind", () => {
    expect(BUN_HTTP_ROUTE_KIND.allowedOn).toEqual([CONTROLLER_KIND.id]);
    expect(new Set(extensions.methodDecorators)).toEqual(new Set([
      Get.definition,
      Post.definition,
      Put.definition,
      Patch.definition,
      Delete.definition,
      Options.definition,
      Head.definition,
    ]));
    expect(extensions.parameterInjectors).toContain(Context.definition);
  });

  it("analyzes every verb, normalized route metadata, DI, and explicit context", () => {
    const result = analyze();
    const controller = result.classes.find(({ name }) => name === "RouteController");
    expect(controller?.kind).toBe(CONTROLLER_KIND);
    expect(controller?.constructor?.dependencies[0]?.token.symbolName).toBe("RouteService");
    expect(controller?.methods.map(({ data }) => data)).toEqual([
      { method: "GET", path: "/" },
      { method: "POST", path: "/users/:id" },
      { method: "PUT", path: "/users/:id" },
      { method: "PATCH", path: "/users/:id" },
      { method: "DELETE", path: "/users/:id" },
      { method: "OPTIONS", path: "/users/:id" },
      { method: "HEAD", path: "/files/*" },
    ]);
    expect(controller?.methods[0]?.parameters).toEqual([
      expect.objectContaining({
        source: "resolver",
        methodIndex: 0,
        resolverId: BUN_HTTP_CONTEXT_RESOLVER_ID,
      }),
    ]);
  });

  it("generates server-only registry plans and no caller contract", () => {
    const analysis = analyze();
    const registry = generateRuntimeRegistryModule({
      analysis,
      extensions,
      modulePath: path.join(fixtureRoot, "registry.generated.ts"),
    });
    expect(registry.code).toContain('method: "get"');
    expect(registry.code).toContain('"method": "GET"');
    expect(registry.code).toContain('createParameterResolverId("bun.http-context")');

    const client = generateCallerContractModule({
      analysis,
      extensions,
      modulePath: path.join(fixtureRoot, "client.generated.ts"),
    });
    expect(client.code).toContain("export interface BunwireRequestContract {}");
    expect(client.code).not.toContain("RouteController");
  });

  it("rejects fake decorators, invalid paths, transport parameters, and conflicting routes", () => {
    expectAnalyzeFailure(
      "invalid-counterfeit.ts",
      "DECORATOR_IDENTITY_CONFLICT",
      /bun\.http-get\.decorator.*not the canonical/i,
    );
    expectAnalyzeFailure("invalid-path.ts", "DECORATOR_ARGUMENT_INVALID", /duplicate path separators/i);
    expect(() => generateRuntimeRegistryModule({
      analysis: analyze("invalid-transport.ts"),
      extensions,
      modulePath: path.join(fixtureRoot, "invalid.generated.ts"),
    })).toThrow(/cannot declare caller-visible parameters/i);
    for (const file of ["invalid-duplicate.ts", "invalid-structural.ts"]) {
      expect(() => generateRuntimeRegistryModule({
        analysis: analyze(file),
        extensions,
        modulePath: path.join(fixtureRoot, "invalid.generated.ts"),
      })).toThrow(/duplicate identity/i);
    }
  });
});
