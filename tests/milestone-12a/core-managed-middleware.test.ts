import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CONTROLLER_KIND,
  Controller,
  INVOCATION_CONTEXT,
  MIDDLEWARE_KIND,
  Middleware,
  MiddlewareAttachmentError,
  MiddlewareDefinitionError,
  MiddlewareNextError,
  Provider,
  SERVICE_KIND,
  Service,
  createToken,
  defineApp,
  defineManagedClassDecorator,
  defineManagedMethodPlan,
  defineMethodKind,
  defineMiddlewareAttachment,
  defineMiddlewareDefinition,
  defineRuntimeRegistry,
  executeMiddlewareChain,
  getManagedClassMetadata,
  validateMiddlewareAttachment,
  type Container,
  type InvocationContext,
  type Middleware as MiddlewareContract,
  type MiddlewareAttachment,
} from "@bunwire/core";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VALUE = createToken<string>("milestone-12a.value");

const TEST_METHOD_KIND = defineMethodKind({
  id: "test.middleware-method",
  allowedOn: [CONTROLLER_KIND],
  invocable: true,
});

function classEntry(
  kind: typeof SERVICE_KIND | typeof CONTROLLER_KIND,
  target: new (...argumentsList: any[]) => object,
  scope: "singleton" | "transient" = "singleton",
) {
  return {
    kind,
    target,
    data: Object.freeze({}),
    scope,
    dependencies: Object.freeze([]),
  } as const;
}

describe("Middleware Redesign 12A — identity and canonical contracts", () => {
  it("defines the canonical kind, decorator metadata, and merged generic contract", () => {
    @Middleware()
    class AuditMiddleware implements MiddlewareContract<{ readonly event: string }, string> {
      async handle(
        context: { readonly event: string },
        next: () => Promise<string>,
      ): Promise<string> {
        return `${context.event}:${await next()}`;
      }
    }

    expect(MIDDLEWARE_KIND).toMatchObject({
      id: "core.middleware",
      injectable: true,
      autoDiscover: true,
      analyzeConstructor: true,
      managedMethods: false,
      registry: true,
    });
    expect(Middleware.definition.kind).toBe(MIDDLEWARE_KIND);
    expect(Middleware.definition.id).toBe("core.middleware.decorator");
    expect(Middleware.definition.compilerSymbol).toEqual({
      moduleSpecifier: "@bunwire/core",
      exportName: "Middleware",
    });
    expect(getManagedClassMetadata(AuditMiddleware)).toMatchObject({
      kindId: MIDDLEWARE_KIND.id,
      target: AuditMiddleware,
      data: { scope: "transient" },
    });
  });

  it("rejects malformed and counterfeit middleware targets", () => {
    expect(() => {
      @Middleware()
      class MissingHandleMiddleware {}
      return MissingHandleMiddleware;
    }).toThrow(MiddlewareDefinitionError);

    @Service()
    class CounterfeitMiddleware {
      async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> {
        return next();
      }
    }

    expect(() => defineMiddlewareAttachment(
      CounterfeitMiddleware as unknown as new () => MiddlewareContract,
    )).toThrow(/canonical @Middleware/i);

    const CounterfeitDecorator = defineManagedClassDecorator<void, Readonly<Record<string, never>>>({
      id: "test.counterfeit-middleware.decorator",
      compilerSymbol: {
        moduleSpecifier: "test.counterfeit-middleware",
        exportName: "CounterfeitDecorator",
      },
      kind: MIDDLEWARE_KIND,
      createMetadata: () => Object.freeze({}),
    });
    @CounterfeitDecorator()
    class SameKindCounterfeit {
      async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> {
        return next();
      }
    }
    expect(() => defineMiddlewareAttachment(SameKindCounterfeit)).toThrow(
      /canonical @Middleware/i,
    );
  });

  it("creates immutable canonical definitions and attachments without coercion", () => {
    @Middleware()
    class ParameterMiddleware {
      async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> {
        return next();
      }
    }

    const sourceParameters = ["admin", "100"];
    const definition = defineMiddlewareDefinition({
      target: ParameterMiddleware,
      data: {
        alias: "guard",
        include: ["/admin/**"],
        only: ["request"],
      },
    });
    const attachment = defineMiddlewareAttachment(ParameterMiddleware, sourceParameters);
    const registry = defineRuntimeRegistry({
      classes: [{
        kind: MIDDLEWARE_KIND,
        target: ParameterMiddleware,
        data: definition.data,
        dependencies: definition.dependencies,
      }],
    });
    sourceParameters.push("later");

    expect(definition).toMatchObject({
      kind: MIDDLEWARE_KIND,
      target: ParameterMiddleware,
      scope: "transient",
      data: {
        scope: "transient",
        alias: "guard",
        include: ["/admin/**"],
        only: ["request"],
      },
    });
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.data.include)).toBe(true);
    expect(attachment.parameters).toEqual(["admin", "100"]);
    expect(Object.isFrozen(attachment)).toBe(true);
    expect(Object.isFrozen(attachment.parameters)).toBe(true);
    expect(registry.classes[0]?.scope).toBe("transient");
  });

  it("fails closed for mutable parameters and malformed runtime definitions", async () => {
    @Middleware()
    class StrictMiddleware {
      async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> {
        return next();
      }
    }

    expect(() => validateMiddlewareAttachment(Object.freeze({
      target: StrictMiddleware,
      parameters: ["mutable"],
    }))).toThrow(MiddlewareAttachmentError);
    expect(() => defineMiddlewareAttachment(StrictMiddleware, [""])).toThrow(
      /non-empty strings/i,
    );

    const malformedRegistry = defineRuntimeRegistry({
      classes: [{
        kind: MIDDLEWARE_KIND,
        target: StrictMiddleware,
        data: Object.freeze({ scope: "transient" as const }),
        scope: "singleton",
        dependencies: [],
      }],
    });
    const app = defineApp().withRuntimeRegistry(malformedRegistry);

    await expect(app.start()).rejects.toBeInstanceOf(MiddlewareDefinitionError);
    expect(app.state).toBe("failed");
  });
});

describe("Middleware Redesign 12A — transient DI and chain execution", () => {
  it("resolves transient middleware with indexed DI and preserves root singleton identity", async () => {
    @Service()
    class SingletonDependency {}

    const instances: object[] = [];
    const dependencies: SingletonDependency[] = [];

    @Middleware()
    class DependencyMiddleware {
      constructor(readonly dependency: SingletonDependency) {
        instances.push(this);
        dependencies.push(dependency);
      }

      async handle(_context: unknown, next: () => Promise<string>): Promise<string> {
        return next();
      }
    }

    const attachment = defineMiddlewareAttachment(DependencyMiddleware);
    const app = defineApp().withRuntimeRegistry(defineRuntimeRegistry({
      classes: [
        classEntry(SERVICE_KIND, SingletonDependency),
        defineMiddlewareDefinition({
          target: DependencyMiddleware,
          dependencies: [{ index: 0, token: SingletonDependency }],
        }),
      ],
    }));
    await app.start();

    const invoke = () => app.runInvocation((invocation) => executeMiddlewareChain({
      invocation,
      attachments: [attachment],
      createContext: () => Object.freeze({}),
      terminal: () => "done",
    }));
    await expect(invoke()).resolves.toBe("done");
    await expect(invoke()).resolves.toBe("done");

    expect(instances).toHaveLength(2);
    expect(instances[0]).not.toBe(instances[1]);
    expect(dependencies[0]).toBe(dependencies[1]);
    expect(dependencies[0]).toBe(app.rootContainer.get(SingletonDependency));
  });

  it("isolates transient middleware instances across concurrent invocations", async () => {
    let created = 0;
    const observed = new Map<string, number>();
    let entered = 0;
    let release!: () => void;
    const bothEntered = new Promise<void>((resolve) => {
      release = resolve;
    });

    @Middleware()
    class ConcurrentMiddleware {
      readonly instanceId = ++created;

      async handle(context: { readonly request: string }, next: () => Promise<string>): Promise<string> {
        observed.set(context.request, this.instanceId);
        entered += 1;
        if (entered === 2) {
          release();
        }
        await bothEntered;
        return next();
      }
    }

    const attachment = defineMiddlewareAttachment(ConcurrentMiddleware);
    const app = defineApp().withRuntimeRegistry(defineRuntimeRegistry({
      classes: [defineMiddlewareDefinition({ target: ConcurrentMiddleware })],
    }));
    await app.start();

    const invoke = (request: string) => app.runInvocation((invocation) => executeMiddlewareChain({
      invocation,
      attachments: [attachment],
      createContext: () => ({ request }),
      terminal: () => request,
    }));
    await expect(Promise.all([invoke("first"), invoke("second")])).resolves.toEqual([
      "first",
      "second",
    ]);

    expect(created).toBe(2);
    expect(observed.get("first")).not.toBe(observed.get("second"));
  });

  it("preserves nesting order and Promise-normalizes transformed results", async () => {
    const events: string[] = [];

    @Middleware()
    class OuterMiddleware {
      async handle(_context: unknown, next: () => Promise<string>): Promise<string> {
        events.push("outer:before");
        const result = await next();
        events.push("outer:after");
        return `outer(${result})`;
      }
    }

    @Middleware()
    class InnerMiddleware {
      async handle(_context: unknown, next: () => Promise<string>): Promise<string> {
        events.push("inner:before");
        const result = await next();
        events.push("inner:after");
        return `inner(${result})`;
      }
    }

    const app = defineApp().withRuntimeRegistry(defineRuntimeRegistry({
      classes: [
        defineMiddlewareDefinition({ target: OuterMiddleware }),
        defineMiddlewareDefinition({ target: InnerMiddleware }),
      ],
    }));
    await app.start();

    const result = await app.runInvocation((invocation) => executeMiddlewareChain({
      invocation,
      attachments: [
        defineMiddlewareAttachment(OuterMiddleware),
        defineMiddlewareAttachment(InnerMiddleware),
      ],
      createContext: () => undefined,
      terminal: () => {
        events.push("terminal");
        return "value";
      },
    }));

    expect(result).toBe("outer(inner(value))");
    expect(events).toEqual([
      "outer:before",
      "inner:before",
      "terminal",
      "inner:after",
      "outer:after",
    ]);
  });

  it("supports short-circuiting and propagates middleware and terminal failures", async () => {
    let terminalRuns = 0;

    @Middleware()
    class ShortCircuitMiddleware {
      async handle(): Promise<string> {
        return "blocked";
      }
    }

    @Middleware()
    class ThrowingMiddleware {
      async handle(): Promise<never> {
        throw new Error("middleware failed");
      }
    }

    @Middleware()
    class PassMiddleware {
      async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> {
        return next();
      }
    }

    const app = defineApp().withRuntimeRegistry(defineRuntimeRegistry({
      classes: [
        defineMiddlewareDefinition({ target: ShortCircuitMiddleware }),
        defineMiddlewareDefinition({ target: ThrowingMiddleware }),
        defineMiddlewareDefinition({ target: PassMiddleware }),
      ],
    }));
    await app.start();
    const execute = (
      attachments: readonly MiddlewareAttachment[],
      terminal: () => unknown | Promise<unknown>,
    ) => app.runInvocation((invocation) => executeMiddlewareChain({
      invocation,
      attachments,
      createContext: () => undefined,
      terminal,
    }));

    await expect(execute(
      [defineMiddlewareAttachment(ShortCircuitMiddleware)],
      () => {
        terminalRuns += 1;
        return "terminal";
      },
    )).resolves.toBe("blocked");
    expect(terminalRuns).toBe(0);

    await expect(execute(
      [defineMiddlewareAttachment(ThrowingMiddleware)],
      () => "unused",
    )).rejects.toThrow("middleware failed");
    await expect(execute(
      [defineMiddlewareAttachment(PassMiddleware)],
      () => Promise.reject(new Error("terminal failed")),
    )).rejects.toThrow("terminal failed");
  });

  it("rejects calling next() more than once", async () => {
    let terminalRuns = 0;

    @Middleware()
    class RepeatingMiddleware {
      async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> {
        await next();
        return next();
      }
    }

    const app = defineApp().withRuntimeRegistry(defineRuntimeRegistry({
      classes: [defineMiddlewareDefinition({ target: RepeatingMiddleware })],
    }));
    await app.start();

    await expect(app.runInvocation((invocation) => executeMiddlewareChain({
      invocation,
      attachments: [defineMiddlewareAttachment(RepeatingMiddleware)],
      createContext: () => undefined,
      terminal: () => {
        terminalRuns += 1;
      },
    }))).rejects.toBeInstanceOf(MiddlewareNextError);
    expect(terminalRuns).toBe(1);
  });
});

describe("Middleware Redesign 12A — shared managed invocation scope", () => {
  it("runs Provider boot, class middleware, and the Controller in one invocation child container", async () => {
    const BOOT_VALUE = createToken<string>("milestone-12a.boot-value");
    const MIDDLEWARE_VALUE = createToken<string>("milestone-12a.middleware-value");
    const seenContexts: InvocationContext[] = [];

    @Provider()
    class ScopeProvider {
      register(): void {}

      boot(context: InvocationContext): void {
        context.container.value(BOOT_VALUE, `boot:${context.id}`);
        seenContexts.push(context);
      }
    }

    @Middleware()
    class ScopeMiddleware {
      constructor(readonly invocation: InvocationContext) {}

      async handle(context: InvocationContext, next: () => Promise<string>): Promise<string> {
        expect(context).toBe(this.invocation);
        expect(context.container.get(BOOT_VALUE)).toBe(`boot:${context.id}`);
        context.container.value(MIDDLEWARE_VALUE, `middleware:${context.id}`);
        return `wrapped:${await next()}`;
      }
    }

    @Controller("scope")
    class ScopeController {
      execute(value: string): string {
        return value;
      }
    }

    const plan = defineManagedMethodPlan({
      kind: TEST_METHOD_KIND,
      ownerKind: CONTROLLER_KIND,
      target: ScopeController,
      method: "execute",
      data: undefined,
      parameters: [{ methodIndex: 0, source: "container", token: MIDDLEWARE_VALUE }],
    });
    const attachment = defineMiddlewareAttachment(ScopeMiddleware, ["scope"]);
    const registry = defineRuntimeRegistry({
      classes: [
        classEntry(CONTROLLER_KIND, ScopeController),
        defineMiddlewareDefinition({
          target: ScopeMiddleware,
          dependencies: [{ index: 0, token: INVOCATION_CONTEXT }],
        }),
      ],
    });
    const app = defineApp()
      .withProviders(ScopeProvider)
      .withManagedMethodKind(TEST_METHOD_KIND)
      .withRuntimeRegistry(registry);
    await app.start();

    const result = await app.invokeManagedMethod<string>(plan, [], {
      around: (invocation, next) => executeMiddlewareChain({
        invocation,
        attachments: [attachment],
        createContext: (_currentAttachment, currentInvocation) => currentInvocation,
        terminal: next,
      }),
    });

    expect(result).toMatch(/^wrapped:middleware:\d+$/);
    expect(seenContexts).toHaveLength(1);
    expect(() => app.rootContainer.get(BOOT_VALUE)).toThrow(/no binding is registered/i);
    expect(() => app.rootContainer.get(MIDDLEWARE_VALUE)).toThrow(/no binding is registered/i);
  });

  it("guards the generic around-invocation continuation from duplicate execution", async () => {
    const app = defineApp();
    await app.start();
    let terminalRuns = 0;

    await expect(app.runInvocation(
      () => {
        terminalRuns += 1;
        return "done";
      },
      {
        around: async (_context, next) => {
          await next();
          return next();
        },
      },
    )).rejects.toThrow(/around hook continuation may only be called once/i);
    expect(terminalRuns).toBe(1);
  });
});

describe("Middleware Redesign 12A — platform boundary", () => {
  it("keeps Core managed middleware free of adapter and platform concepts", async () => {
    const middlewareDirectory = path.join(repositoryRoot, "packages/core/src/middleware");
    const files = await fs.readdir(middlewareDirectory);
    const source = (await Promise.all(files
      .filter((file) => file.endsWith(".ts"))
      .map((file) => fs.readFile(path.join(middlewareDirectory, file), "utf8"))))
      .join("\n")
      .toLowerCase();

    expect(source).not.toMatch(/electrobun|browserwindow|webview|express|http request|rpc endpoint/);
    expect(source).not.toMatch(/from\s+["'][^"']*(electrobun|vite)/);
  });
});
