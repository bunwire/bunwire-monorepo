import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  defineAdapterCompilerDescriptor,
} from "@bunwire/core";
import {
  BunwireCompilerError,
  aggregateCompilerExtensions,
  analyzeBunwireProgram,
} from "@bunwire/vite";
import { describe, expect, it } from "vitest";
import {
  CONSUMER_KIND,
  Consumer,
  FrameworkValue,
  SUBSCRIBE_KIND,
  Subscribe,
} from "../fixtures/milestone-8-analysis/extensions.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/milestone-8-analysis");
const extensions = aggregateCompilerExtensions(defineAdapterCompilerDescriptor({
  id: "fixture.analysis-host",
  classKinds: [CONSUMER_KIND],
  classDecorators: [Consumer.definition],
  methodKinds: [SUBSCRIBE_KIND],
  methodDecorators: [Subscribe.definition],
  parameterInjectors: [FrameworkValue.definition],
}));

function analyze(...files: string[]) {
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

describe("Milestone 8 — TypeScript symbol analysis and constructor DI", () => {
  it("recognizes aliased managed decorators while ignoring a same-named unrelated decorator", () => {
    const result = analyze(
      "valid/tokens.ts",
      "valid/services.ts",
      "valid/controller.ts",
    );

    expect(result.classes.map(({ name }) => name)).toEqual([
      "UserController",
      "LoggerService",
      "UserService",
    ]);
    expect(result.classes.find(({ name }) => name === "SameNamedButUnrelated")).toBeUndefined();
    expect(result.classes.find(({ name }) => name === "LoggerService")).toMatchObject({
      decoratorId: "core.service.decorator",
      kind: { id: "core.service" },
    });
  });

  it("resolves imported and aliased managed class dependencies across files", () => {
    const result = analyze(
      "valid/tokens.ts",
      "valid/services.ts",
      "valid/controller.ts",
    );
    const controller = result.classes.find(({ name }) => name === "UserController");

    expect(controller?.constructor?.dependencies).toEqual([
      expect.objectContaining({
        index: 0,
        source: "container",
        explicit: false,
        token: expect.objectContaining({
          expression: "Users",
          symbolName: "UserService",
        }),
      }),
    ]);
    expect(controller?.constructor?.dependencies[0]?.token.declaration.filePath)
      .toBe(path.join(fixtureRoot, "valid/services.ts"));
  });

  it("extracts explicit class/token injection and preserves constructor positions", () => {
    const result = analyze("valid/tokens.ts", "valid/services.ts");
    const service = result.classes.find(({ name }) => name === "UserService");

    expect(service?.constructor).toMatchObject({ parameterCount: 3 });
    expect(service?.constructor?.dependencies.map((dependency) => ({
      index: dependency.index,
      explicit: dependency.explicit,
      expression: dependency.token.expression,
      symbol: dependency.token.symbolName,
    }))).toEqual([
      { index: 0, explicit: false, expression: "LoggerService", symbol: "LoggerService" },
      { index: 1, explicit: true, expression: "CACHE", symbol: "CACHE" },
      { index: 2, explicit: true, expression: "RandomUtility", symbol: "RandomUtility" },
    ]);
    expect(service?.constructor?.dependencies.every(({ token }) => token.location.line > 0)).toBe(true);
  });

  it("rejects a plain undecorated class dependency with explicit remediation", () => {
    expect(() => analyze("valid/tokens.ts", "invalid-plain.ts")).toThrowError(
      expect.objectContaining({
        code: "CONSTRUCTOR_INJECTION_INVALID",
        message: expect.stringMatching(/not an injectable managed class.*@Inject\(TOKEN\).*binding/i),
        location: expect.objectContaining({ filePath: path.join(fixtureRoot, "invalid-plain.ts") }),
      }),
    );
  });

  it("rejects an interface dependency without @Inject() with a useful source location", () => {
    try {
      analyze("valid/tokens.ts", "invalid-interface.ts");
    } catch (error) {
      expect(error).toBeInstanceOf(BunwireCompilerError);
      expect(error).toMatchObject({
        code: "CONSTRUCTOR_INJECTION_INVALID",
        filePath: path.join(fixtureRoot, "invalid-interface.ts"),
      });
      expect((error as BunwireCompilerError).message).toMatch(/interface|Cache|@Inject/i);
      return;
    }
    throw new Error("Expected interface constructor injection to fail.");
  });

  it("rejects an interface itself as an @Inject() token because it has no runtime value", () => {
    expect(() => analyze("invalid-interface-token.ts")).toThrowError(
      expect.objectContaining({
        code: "CONSTRUCTOR_INJECTION_INVALID",
        message: expect.stringMatching(/runtime value.*type-only.*createToken/i),
      }),
    );
  });

  it("uses one deterministic Program/checker and exposes only the configured source universe", () => {
    const files = ["valid/services.ts", "valid/tokens.ts"].map((file) => path.join(fixtureRoot, file));
    const result = analyze("valid/services.ts", "valid/tokens.ts");

    expect(result.context.program.getTypeChecker()).toBe(result.context.checker);
    expect(result.context.sourceFiles.map(({ fileName }) => path.resolve(fileName)).sort())
      .toEqual(files.sort());
    expect(Object.isFrozen(result.classes)).toBe(true);
  });
});
