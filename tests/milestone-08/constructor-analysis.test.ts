import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  defineAdapterCompilerDescriptor,
  defineManagedClassDecorator,
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
  return analyzeWithExtensions(extensions, ...files);
}

function analyzeWithExtensions(
  selectedExtensions: typeof extensions,
  ...files: string[]
) {
  return analyzeBunwireProgram({
    projectRoot: repositoryRoot,
    sourceFiles: files.map((file) => path.join(fixtureRoot, file)),
    extensions: selectedExtensions,
    compilerOptions: {
      baseUrl: repositoryRoot,
      paths: {
        "@bunwire/core": ["packages/core/src/index.ts"],
        "@bunwire/test-analysis-extensions": ["tests/fixtures/milestone-8-analysis/extensions.ts"],
      },
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

  it("recognizes a canonical managed decorator through a re-export", () => {
    const result = analyze("valid/reexports.ts", "valid/reexported-service.ts");

    expect(result.classes).toMatchObject([{
      name: "ReexportedManagedService",
      kind: { id: "core.service" },
      decoratorId: "core.service.decorator",
    }]);
  });

  it("rejects a different class decorator or Inject symbol claiming a registered ID", () => {
    for (const fixture of ["invalid-shadow-class.ts", "invalid-shadow-inject.ts"]) {
      expect(() => analyze(fixture)).toThrowError(expect.objectContaining({
        code: "DECORATOR_IDENTITY_CONFLICT",
        message: expect.stringMatching(/claims registered ID.*not the canonical/i),
      }));
    }
  });

  it("requires valid, unique compiler symbol declarations", () => {
    expect(() => defineManagedClassDecorator({
      id: "fixture.missing-symbol",
      kind: CONSUMER_KIND,
      createMetadata: () => undefined,
    } as any)).toThrow(/compilerSymbol.*moduleSpecifier.*exportName/i);

    const canonical = extensions.classDecorators.find(({ id }) => id === "core.service.decorator");
    const invalidExtensions = {
      ...extensions,
      classDecorators: Object.freeze(extensions.classDecorators.map((definition) => (
        definition === canonical
          ? Object.freeze({
            ...definition,
            compilerSymbol: { moduleSpecifier: "fixture.missing-module", exportName: "Service" },
          })
          : definition
      ))),
    } as typeof extensions;
    expect(() => analyzeWithExtensions(invalidExtensions, "valid/services.ts"))
      .toThrowError(expect.objectContaining({ code: "COMPILER_SYMBOL_INVALID" }));

    const missingExportExtensions = {
      ...extensions,
      classDecorators: Object.freeze(extensions.classDecorators.map((definition) => (
        definition === canonical
          ? Object.freeze({
            ...definition,
            compilerSymbol: { moduleSpecifier: "@bunwire/core", exportName: "MissingService" },
          })
          : definition
      ))),
    } as typeof extensions;
    expect(() => analyzeWithExtensions(missingExportExtensions, "valid/services.ts"))
      .toThrowError(expect.objectContaining({
        code: "COMPILER_SYMBOL_INVALID",
        message: expect.stringMatching(/does not export.*MissingService/i),
      }));

    const First = defineManagedClassDecorator({
      id: "fixture.first.decorator",
      compilerSymbol: { moduleSpecifier: "@bunwire/test-analysis-extensions", exportName: "Consumer" },
      kind: CONSUMER_KIND,
      createMetadata: () => undefined,
    });
    const Second = defineManagedClassDecorator({
      id: "fixture.second.decorator",
      compilerSymbol: { moduleSpecifier: "@bunwire/test-analysis-extensions", exportName: "Consumer" },
      kind: CONSUMER_KIND,
      createMetadata: () => undefined,
    });
    expect(() => aggregateCompilerExtensions(defineAdapterCompilerDescriptor({
      id: "fixture.duplicate-symbol-host",
      classKinds: [CONSUMER_KIND],
      classDecorators: [First.definition, Second.definition],
    }))).toThrowError(expect.objectContaining({ code: "EXTENSION_CONFLICT" }));
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

  it("rejects runtime values that are not valid explicit injection tokens", () => {
    for (const fixture of [
      "invalid-token-number.ts",
      "invalid-token-object.ts",
      "invalid-token-function.ts",
      "invalid-token-any.ts",
      "invalid-token-unknown.ts",
    ]) {
      expect(() => analyze(fixture)).toThrowError(expect.objectContaining({
        code: "CONSTRUCTOR_INJECTION_INVALID",
        message: expect.stringMatching(/createToken\(\).*constructable class/i),
      }));
    }
  });

  it("rejects hidden inherited constructor parameters and accepts an explicit forwarding constructor", () => {
    expect(() => analyze("invalid-inherited-constructor.ts")).toThrowError(
      expect.objectContaining({
        code: "CONSTRUCTOR_INJECTION_INVALID",
        message: expect.stringMatching(/inherits a constructor with parameters.*explicit forwarding constructor/i),
      }),
    );

    const result = analyze("valid/explicit-inherited-constructor.ts");
    expect(result.classes.find(({ name }) => name === "ExplicitConstructorService")?.constructor)
      .toMatchObject({
        parameterCount: 1,
        dependencies: [{ index: 0, token: { symbolName: "ExplicitInheritedDependency" } }],
      });
  });

  it("rejects direct and indirect managed constructor dependency cycles", () => {
    expect(() => analyze("invalid-self-cycle.ts")).toThrowError(expect.objectContaining({
      code: "CONSTRUCTOR_DEPENDENCY_CYCLE",
      message: expect.stringMatching(/SelfCycleService -> SelfCycleService/),
    }));
    expect(() => analyze("invalid-constructor-cycle.ts")).toThrowError(expect.objectContaining({
      code: "CONSTRUCTOR_DEPENDENCY_CYCLE",
      message: expect.stringMatching(/CycleA -> CycleB -> CycleA|CycleB -> CycleA -> CycleB/),
    }));
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
