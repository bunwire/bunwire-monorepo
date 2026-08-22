import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CallerArgumentError,
  defineAdapterCompilerDescriptor,
  defineApp,
  defineManagedMethodPlan,
  type ManagedMethodParameterPlan,
} from "@bunwire/core";
import {
  aggregateCompilerExtensions,
  analyzeBunwireProgram,
  type AnalyzedManagedMethod,
  type AnalyzedMethodParameter,
} from "@bunwire/vite";
import { describe, expect, it } from "vitest";
import {
  CONSUMER_KIND,
  Consumer,
  FrameworkValue,
  SUBSCRIBE_KIND,
  Subscribe,
} from "../fixtures/milestone-8-analysis/extensions.js";
import {
  METHOD_CACHE,
  MethodUserService,
  OrderConsumer,
} from "../fixtures/milestone-8-analysis/methods.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/milestone-8-analysis");
const extensions = aggregateCompilerExtensions(defineAdapterCompilerDescriptor({
  id: "fixture.method-analysis-host",
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

function method(result: ReturnType<typeof analyze>, name: string): AnalyzedManagedMethod {
  const analyzed = result.classes
    .find(({ name: className }) => className === "OrderConsumer")
    ?.methods.find(({ name: methodName }) => methodName === name);
  if (!analyzed) {
    throw new Error(`Missing analyzed method ${name}.`);
  }
  return analyzed;
}

function runtimeParameters(parameters: readonly AnalyzedMethodParameter[]): ManagedMethodParameterPlan[] {
  return parameters.map((parameter): ManagedMethodParameterPlan => {
    if (parameter.source === "transport") {
      return {
        source: "transport",
        methodIndex: parameter.methodIndex,
        argumentIndex: parameter.argumentIndex,
        optional: parameter.optional,
        rest: parameter.rest,
      };
    }
    if (parameter.source === "resolver") {
      return {
        source: "resolver",
        methodIndex: parameter.methodIndex,
        resolverId: parameter.resolverId,
        data: parameter.data,
      };
    }
    const tokens = {
      MethodUserService,
      METHOD_CACHE,
    } as const;
    const token = tokens[parameter.token.symbolName as keyof typeof tokens];
    if (!token) {
      throw new Error(`Missing runtime token ${parameter.token.symbolName}.`);
    }
    return {
      source: "container",
      methodIndex: parameter.methodIndex,
      token,
    };
  });
}

describe("Milestone 9 — managed-method parameter plans", () => {
  it("maps a method without injection directly from method indexes to caller indexes", () => {
    const direct = method(analyze("methods.ts"), "direct");

    expect(direct.parameters).toMatchObject([
      { source: "transport", methodIndex: 0, argumentIndex: 0, optional: false, rest: false },
      { source: "transport", methodIndex: 1, argumentIndex: 1, optional: false, rest: false },
    ]);
    expect(direct).toMatchObject({ minimumCallerArguments: 2, maximumCallerArguments: 2 });
  });

  it("compacts one middle managed-class injection without changing true method indexes", () => {
    const strict = method(analyze("methods.ts"), "strict");

    expect(strict.parameters.map((parameter) => ({
      source: parameter.source,
      methodIndex: parameter.methodIndex,
      argumentIndex: parameter.source === "transport" ? parameter.argumentIndex : undefined,
    }))).toEqual([
      { source: "transport", methodIndex: 0, argumentIndex: 0 },
      { source: "container", methodIndex: 1, argumentIndex: undefined },
      { source: "transport", methodIndex: 2, argumentIndex: 1 },
    ]);
  });

  it("classifies multiple interleaved caller, managed, explicit-token, and framework sources", () => {
    const interleaved = method(analyze("methods.ts"), "interleaved");

    expect(interleaved.parameters.map((parameter) => {
      if (parameter.source === "transport") {
        return [parameter.methodIndex, parameter.source, parameter.argumentIndex, parameter.optional, parameter.rest];
      }
      if (parameter.source === "container") {
        return [parameter.methodIndex, parameter.source, parameter.token.symbolName, parameter.explicit];
      }
      return [parameter.methodIndex, parameter.source, parameter.resolverId];
    })).toEqual([
      [0, "transport", 0, false, false],
      [1, "container", "MethodUserService", false],
      [2, "transport", 1, false, false],
      [3, "container", "METHOD_CACHE", true],
      [4, "resolver", "fixture.framework-value"],
      [5, "transport", 2, true, false],
      [6, "transport", 3, true, true],
    ]);
    expect(interleaved).toMatchObject({
      minimumCallerArguments: 2,
      maximumCallerArguments: null,
    });
  });

  it("keeps a plain DTO class caller-visible and an interface with @Inject token caller-invisible", () => {
    const interleaved = method(analyze("methods.ts"), "interleaved");

    expect(interleaved.parameters[2]).toMatchObject({
      source: "transport",
      methodIndex: 2,
      argumentIndex: 1,
    });
    expect(interleaved.parameters[3]).toMatchObject({
      source: "container",
      methodIndex: 3,
      explicit: true,
      token: { symbolName: "METHOD_CACHE" },
    });
  });

  it("gives a registered parameter injector precedence over managed-type auto DI", () => {
    const precedence = method(analyze("methods.ts"), "precedence");

    expect(precedence.parameters).toMatchObject([{
      source: "resolver",
      methodIndex: 0,
      resolverId: "fixture.framework-value",
      injectorId: "fixture.framework-value.decorator",
    }]);
    expect(precedence).toMatchObject({ minimumCallerArguments: 0, maximumCallerArguments: 0 });
  });

  it("records a final rest parameter and allows unbounded runtime caller arguments", async () => {
    const rest = method(analyze("methods.ts"), "rest");
    const plan = defineManagedMethodPlan({
      kind: SUBSCRIBE_KIND,
      ownerKind: CONSUMER_KIND,
      target: OrderConsumer,
      method: "rest",
      data: rest.data,
      parameters: runtimeParameters(rest.parameters),
    });
    const app = defineApp()
      .withManagedClassKind(CONSUMER_KIND)
      .withManagedMethodKind(SUBSCRIBE_KIND)
      .withConventionBindings((container) => {
        container.transient(OrderConsumer);
      });
    await app.start();

    expect(rest).toMatchObject({ minimumCallerArguments: 1, maximumCallerArguments: null });
    await expect(app.invokeManagedMethod(plan, ["prefix", "a", "b", "c"]))
      .resolves.toBe("prefix:a,b,c");
  });

  it("rejects too few and too many caller args at runtime from the compiled strict plan", async () => {
    const strict = method(analyze("methods.ts"), "strict");
    const plan = defineManagedMethodPlan({
      kind: SUBSCRIBE_KIND,
      ownerKind: CONSUMER_KIND,
      target: OrderConsumer,
      method: "strict",
      data: strict.data,
      parameters: runtimeParameters(strict.parameters),
    });
    const app = defineApp()
      .withManagedClassKind(CONSUMER_KIND)
      .withManagedMethodKind(SUBSCRIBE_KIND)
      .withConventionBindings((container) => {
        container.transient(OrderConsumer).transient(MethodUserService);
      });
    await app.start();

    await expect(app.invokeManagedMethod(plan, ["only-one"]))
      .rejects.toMatchObject({ minimum: 2, maximum: 2, received: 1 });
    await expect(app.invokeManagedMethod(plan, ["id", "name", "extra"]))
      .rejects.toBeInstanceOf(CallerArgumentError);
    await expect(app.invokeManagedMethod(plan, ["id", "name"]))
      .resolves.toBe("id:MethodUserService:name");
  });

  it("rejects a managed method decorator on an incompatible owning class kind", () => {
    expect(() => analyze("invalid-method-placement.ts")).toThrowError(
      expect.objectContaining({
        code: "MANAGED_METHOD_INVALID",
        message: expect.stringMatching(/not allowed.*core\.service/i),
      }),
    );
  });

  it("rejects incompatible parameter-source decorators with an actionable diagnostic", () => {
    expect(() => analyze("invalid-parameter-conflict.ts")).toThrowError(
      expect.objectContaining({
        code: "PARAMETER_SOURCE_CONFLICT",
        message: expect.stringMatching(/incompatible or duplicate parameter-source decorators/i),
      }),
    );
  });

  it("does not expose undecorated public methods", () => {
    const consumer = analyze("methods.ts").classes.find(({ name }) => name === "OrderConsumer");
    expect(consumer?.methods.map(({ name }) => name)).not.toContain("ordinary");
  });
});
