import { describe, expect, it } from "vitest";
import {
  APPLICATION_CONTEXT,
  Application,
  ApplicationStateError,
  Container,
  INVOCATION_CONTEXT,
  Provider,
  Service,
  createToken,
  defineApp,
  defineProviderRegistry,
  type InvocationContext,
  type ProviderConstructor,
} from "@bunwire/core";

function deferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("Milestone 4 — Application definition and startup", () => {
  it("defineApp() returns a stable instantiated Application before startup", () => {
    const app = defineApp();

    expect(app).toBeInstanceOf(Application);
    expect(app.state).toBe("configuring");
    expect(app.isRunning).toBe(false);
    expect(() => app.rootContainer).toThrow(ApplicationStateError);
  });

  it("configuration chains on the same object without starting it", () => {
    @Provider()
    class EmptyProvider {
      register(): void {}
    }
    let conventionRuns = 0;
    const app = defineApp();

    const configured = app
      .withProviderRegistry(defineProviderRegistry([EmptyProvider]))
      .withProviders(EmptyProvider)
      .withConventionBindings(() => {
        conventionRuns += 1;
      })
      .withContext({ host: "manual" });

    expect(configured).toBe(app);
    expect(app.state).toBe("configuring");
    expect(conventionRuns).toBe(0);
  });

  it("withContext() stores context without startup and exposes it before register()", async () => {
    const manualContext = { host: "existing-host" };
    let contextSeenDuringRegister: unknown;
    let registerContainer: Container | undefined;

    @Provider()
    class ContextProvider {
      register(container: Container): void {
        registerContainer = container;
        contextSeenDuringRegister = container.get(APPLICATION_CONTEXT);
      }
    }

    const app = defineApp()
      .withContext(manualContext)
      .withProviderRegistry(defineProviderRegistry([ContextProvider]));

    expect(app.state).toBe("configuring");
    expect(contextSeenDuringRegister).toBeUndefined();

    await app.start();

    expect(contextSeenDuringRegister).toBe(manualContext);
    expect(registerContainer).toBe(app.rootContainer);
    expect(app.rootContainer.get(APPLICATION_CONTEXT)).toBe(manualContext);
  });

  it("start() creates one root container and every later start fails clearly", async () => {
    const app = defineApp();

    await app.start();
    const root = app.rootContainer;

    await expect(app.start()).rejects.toThrow(
      /start\(\) can only be called once.*running/i,
    );
    expect(app.rootContainer).toBe(root);
    expect(app.state).toBe("running");
  });

  it("a concurrent start attempt fails without creating another root container", async () => {
    const registrationGate = deferred();

    @Provider()
    class SlowProvider {
      async register(): Promise<void> {
        await registrationGate.promise;
      }
    }

    const app = defineApp().withProviders(SlowProvider);
    const firstStart = app.start();
    const root = app.rootContainer;

    await expect(app.start()).rejects.toThrow(/called once.*starting/i);
    expect(app.rootContainer).toBe(root);

    registrationGate.resolve();
    await firstStart;
  });

  it("configuration is rejected after startup begins", async () => {
    const app = defineApp();
    await app.start();

    expect(() => app.withContext({ late: true })).toThrow(/cannot modify.*running/i);
    expect(() => app.withConventionBindings(() => {})).toThrow(/cannot modify.*running/i);
  });
});

describe("Milestone 4 — Provider registry and lifecycle", () => {
  it("consumes registries, deduplicates classes, constructs with zero arguments, and registers once", async () => {
    let constructions = 0;
    let constructorArgumentCount = -1;
    let registrations = 0;
    let boots = 0;
    let secondaryRegistrations = 0;
    let secondaryBoots = 0;

    @Provider()
    class LifecycleProvider {
      constructor(...argumentsList: unknown[]) {
        constructions += 1;
        constructorArgumentCount = argumentsList.length;
      }

      register(): void {
        registrations += 1;
      }

      boot(): void {
        boots += 1;
      }
    }

    @Provider()
    class SecondaryProvider {
      register(): void {
        secondaryRegistrations += 1;
      }

      boot(): void {
        secondaryBoots += 1;
      }
    }

    const registry = defineProviderRegistry([
      LifecycleProvider,
      LifecycleProvider,
      SecondaryProvider,
    ]);
    const app = defineApp()
      .withProviderRegistry(registry)
      .withProviders(LifecycleProvider);

    await app.start();
    await app.runInvocation(() => undefined);
    await app.runInvocation(() => undefined);
    await app.runInvocation(() => undefined);

    expect(constructions).toBe(1);
    expect(constructorArgumentCount).toBe(0);
    expect(registrations).toBe(1);
    expect(boots).toBe(3);
    expect(secondaryRegistrations).toBe(1);
    expect(secondaryBoots).toBe(3);
  });

  it("constructs Providers with optional, default, and rest parameters using zero supplied arguments", async () => {
    const constructorArgumentCounts: number[] = [];

    @Provider()
    class OptionalConstructorProvider {
      constructor(_dependency?: object) {
        constructorArgumentCounts.push(arguments.length);
      }

      register(): void {}
    }

    @Provider()
    class DefaultConstructorProvider {
      constructor(_dependency: object = {}) {
        constructorArgumentCounts.push(arguments.length);
      }

      register(): void {}
    }

    @Provider()
    class RestConstructorProvider {
      constructor(...argumentsList: unknown[]) {
        constructorArgumentCounts.push(argumentsList.length);
      }

      register(): void {}
    }

    const app = defineApp().withProviders(
      OptionalConstructorProvider,
      DefaultConstructorProvider,
      RestConstructorProvider,
    );

    await app.start();

    expect(constructorArgumentCounts).toEqual([0, 0, 0]);
  });

  it("rejects required Provider constructor arguments at the TypeScript registry boundary", () => {
    class RequiredConstructorProvider {
      constructor(_dependency: object) {}
      register(): void {}
    }

    if (false) {
      defineProviderRegistry([
        // @ts-expect-error Providers must be constructible with zero supplied arguments.
        RequiredConstructorProvider,
      ]);
    }

    expect(true).toBe(true);
  });

  it("explicit Provider bindings override convention defaults", async () => {
    const MODE = createToken<string>("mode");

    @Provider()
    class OverrideProvider {
      register(container: Container): void {
        container.value(MODE, "provider-explicit");
      }
    }

    const app = defineApp()
      .withConventionBindings((container) => {
        container.value(MODE, "convention-default");
      })
      .withProviders(OverrideProvider);

    await app.start();

    expect(app.rootContainer.get(MODE)).toBe("provider-explicit");
  });

  it("boot runs only per invocation and receives the real InvocationContext", async () => {
    const bootContexts: InvocationContext[] = [];
    const manualContext = { host: "manual" };

    @Provider()
    class BootProvider {
      register(): void {}

      boot(context: InvocationContext): void {
        bootContexts.push(context);
      }
    }

    const app = defineApp().withContext(manualContext).withProviders(BootProvider);
    await app.start();
    expect(bootContexts).toEqual([]);

    const handlerContext = await app.runInvocation((context) => {
      expect(context.container.get(INVOCATION_CONTEXT)).toBe(context);
      expect(context.container.get(APPLICATION_CONTEXT)).toBe(manualContext);
      expect(context.applicationContext).toBe(manualContext);
      expect(context.container).not.toBe(context.rootContainer);
      expect(context.container.parent).toBe(context.rootContainer);
      return context;
    });

    expect(bootContexts).toEqual([handlerContext]);
    expect(bootContexts[0]?.application).toBe(app);
    expect(bootContexts[0]?.rootContainer).toBe(app.rootContainer);
  });

  it("does not accept managed invocations until all Provider registrations complete", async () => {
    const registrationGate = deferred();
    let handlerRuns = 0;

    @Provider()
    class AsyncProvider {
      async register(): Promise<void> {
        await registrationGate.promise;
      }
    }

    const app = defineApp().withProviders(AsyncProvider);
    const startup = app.start();

    expect(app.state).toBe("starting");
    await expect(app.runInvocation(() => {
      handlerRuns += 1;
    })).rejects.toThrow(/require a running Application.*starting/i);
    expect(handlerRuns).toBe(0);

    registrationGate.resolve();
    await startup;
    await app.runInvocation(() => {
      handlerRuns += 1;
    });
    expect(handlerRuns).toBe(1);
  });

  it("never gives Service classes Provider lifecycle behavior", async () => {
    let registrations = 0;
    let boots = 0;

    @Service()
    class LifecycleNamedService {
      register(): void {
        registrations += 1;
      }

      boot(): void {
        boots += 1;
      }
    }

    const app = defineApp().withConventionBindings((container) => {
      container.singleton(LifecycleNamedService);
    });

    await app.start();
    expect(app.rootContainer.get(LifecycleNamedService)).toBeInstanceOf(LifecycleNamedService);
    await app.runInvocation(() => undefined);

    expect(registrations).toBe(0);
    expect(boots).toBe(0);
  });

  it("rejects a non-Provider class in the Provider registry", async () => {
    @Service()
    class InvalidRegistryEntry {
      register(): void {}
    }

    const app = defineApp().withProviders(InvalidRegistryEntry);

    await expect(app.start()).rejects.toThrow(/must be decorated with @Provider/i);
    expect(app.state).toBe("failed");
  });

  it("rejects an undecorated subclass of a decorated Provider", async () => {
    @Provider()
    class BaseProvider {
      register(): void {}
    }

    class UndecoratedProviderSubclass extends BaseProvider {}

    const app = defineApp().withProviders(UndecoratedProviderSubclass);

    await expect(app.start()).rejects.toThrow(/must be decorated with @Provider/i);
    expect(app.state).toBe("failed");
  });

  it("rejects a decorated runtime registry entry without a callable register hook", async () => {
    @Provider()
    class MissingRegisterProvider {}

    const app = defineApp().withProviders(
      MissingRegisterProvider as unknown as ProviderConstructor,
    );

    await expect(app.start()).rejects.toThrow(
      /must define a callable register\(container\) lifecycle hook/i,
    );
    expect(app.state).toBe("failed");
  });
});

describe("Milestone 4 — child and invocation scopes", () => {
  it("inherits root bindings while keeping local values isolated", () => {
    const REQUEST_ID = createToken<string>("request-id");
    class RequestReader {
      constructor(readonly requestId: string) {}
    }

    const root = new Container()
      .transient(RequestReader)
      .registerConstructorMetadata({
        target: RequestReader,
        dependencies: [{ index: 0, token: REQUEST_ID }],
      });
    const first = root.createChild().value(REQUEST_ID, "first");
    const second = root.createChild().value(REQUEST_ID, "second");

    expect(first.root).toBe(root);
    expect(second.root).toBe(root);
    expect(first.get(RequestReader).requestId).toBe("first");
    expect(second.get(RequestReader).requestId).toBe("second");
    expect(() => root.get(REQUEST_ID)).toThrow(/no binding is registered/i);
  });

  it("shares inherited root singletons without allowing child overrides to escape", () => {
    const LABEL = createToken<string>("label");
    const SINGLETON = createToken<object>("root-singleton");
    const root = new Container()
      .value(LABEL, "root")
      .singleton(SINGLETON, () => ({}));
    const first = root.createChild().value(LABEL, "first");
    const second = root.createChild();

    expect(first.get(LABEL)).toBe("first");
    expect(second.get(LABEL)).toBe("root");
    expect(root.get(LABEL)).toBe("root");
    expect(first.get(SINGLETON)).toBe(second.get(SINGLETON));
    expect(first.get(SINGLETON)).toBe(root.get(SINGLETON));
  });

  it("isolates values across concurrent managed invocations", async () => {
    const REQUEST_ID = createToken<string>("concurrent-request-id");
    const BOOT_VALUE = createToken<string>("boot-value");
    const bothBootsEntered = deferred();
    let bootsEntered = 0;

    @Provider()
    class RequestProvider {
      register(): void {}

      async boot(context: InvocationContext): Promise<void> {
        const requestId = context.container.get(REQUEST_ID);
        bootsEntered += 1;
        if (bootsEntered === 2) {
          bothBootsEntered.resolve();
        }
        await bothBootsEntered.promise;
        context.container.value(BOOT_VALUE, requestId);
      }
    }

    const app = defineApp().withProviders(RequestProvider);
    await app.start();

    const invoke = (requestId: string) => app.runInvocation(
      async (context) => {
        await Promise.resolve();
        return {
          bootValue: context.container.get(BOOT_VALUE),
          requestId: context.container.get(REQUEST_ID),
        };
      },
      {
        configure: (context) => {
          context.container.value(REQUEST_ID, requestId);
        },
      },
    );

    const [first, second] = await Promise.all([invoke("first"), invoke("second")]);

    expect(first).toEqual({ bootValue: "first", requestId: "first" });
    expect(second).toEqual({ bootValue: "second", requestId: "second" });
    expect(() => app.rootContainer.get(REQUEST_ID)).toThrow(/no binding is registered/i);
    expect(() => app.rootContainer.get(BOOT_VALUE)).toThrow(/no binding is registered/i);
  });
});
