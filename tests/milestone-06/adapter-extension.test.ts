import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  APPLICATION_CONTEXT,
  Adapter,
  Application,
  ApplicationStateError,
  CONTROLLER_KIND,
  Controller,
  Container,
  Provider,
  SERVICE_KIND,
  createToken,
  defineAdapterCompilerDescriptor,
  defineAdapterValidationHook,
  defineApp,
  defineClassKind,
  defineCompilerMetadataHandler,
  defineManagedClassDecorator,
  defineManagedMethodDecorator,
  defineManagedMethodPlan,
  defineMethodKind,
  defineParameterInjector,
  defineParameterResolver,
  defineRuntimeRegistry,
  defineRuntimeRegistryConsumer,
  getManagedClassMetadata,
  getManagedMethodMetadata,
  getParameterInjectorMetadata,
  type AdapterHostContext,
  type AdapterPreparationContext,
  type InvocationContext,
  type ManagedMethodPlan,
  type NativeObjectConfigurationCallback,
  type RuntimeRegistry,
  type RuntimeRegistryConsumerContext,
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

const CONSUMER_KIND = defineClassKind({
  id: "fake.consumer",
  injectable: true,
  autoDiscover: true,
  analyzeConstructor: true,
  managedMethods: true,
  registry: true,
});

const Consumer = defineManagedClassDecorator<string | undefined, { readonly name: string | undefined }>({
  id: "fake.consumer.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/test-fake-adapter", exportName: "Consumer" },
  kind: CONSUMER_KIND,
  createMetadata: (name) => Object.freeze({ name }),
});

const SUBSCRIBE_KIND = defineMethodKind({
  id: "fake.subscribe",
  allowedOn: [CONSUMER_KIND],
  invocable: true,
});

const Subscribe = defineManagedMethodDecorator<string, { readonly topic: string }>({
  id: "fake.subscribe.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/test-fake-adapter", exportName: "Subscribe" },
  kind: SUBSCRIBE_KIND,
  createMetadata: (topic) => Object.freeze({ topic }),
});

const DELIVERY_RESOLVER = defineParameterResolver({
  id: "fake.delivery",
  resolve: ({ context }) => (
    (context.applicationContext as FakeContext | undefined)?.delivery
  ),
});

const Delivery = defineParameterInjector<void, Readonly<Record<string, never>>>({
  id: "fake.delivery.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/test-fake-adapter", exportName: "Delivery" },
  resolverId: DELIVERY_RESOLVER.id,
  createMetadata: () => Object.freeze({}),
});

const FAKE_METADATA_HANDLER = defineCompilerMetadataHandler({
  id: "fake.topic-metadata",
  data: Object.freeze({ category: "subscription" }),
});

const FAKE_COMPILER_DESCRIPTOR = defineAdapterCompilerDescriptor({
  id: "fake.host",
  classKinds: [CONSUMER_KIND],
  classDecorators: [Consumer.definition],
  methodKinds: [SUBSCRIBE_KIND],
  methodDecorators: [Subscribe.definition],
  parameterInjectors: [Delivery.definition],
  metadataHandlers: [FAKE_METADATA_HANDLER],
});

type FakeHandler = (argumentsList: readonly unknown[]) => Promise<unknown>;

class FakeHost {
  readonly handlers = new Map<string, FakeHandler>();
  accepting = false;

  register(topic: string, handler: FakeHandler): void {
    this.handlers.set(topic, handler);
  }

  async invoke(topic: string, ...argumentsList: readonly unknown[]): Promise<unknown> {
    if (!this.accepting) {
      throw new Error("Fake host is not accepting managed traffic.");
    }
    const handler = this.handlers.get(topic);
    if (!handler) {
      throw new Error(`No fake handler is registered for "${topic}".`);
    }
    return handler(argumentsList);
  }
}

interface FakeContext {
  readonly host: FakeHost;
  readonly delivery: { readonly id: string };
  readonly events: string[];
  readonly registrationGate?: Promise<void>;
  readonly registrationStarted?: () => void;
}

@Provider()
class FakeAdapterProvider {
  async register(container: Container): Promise<void> {
    const context = container.get(APPLICATION_CONTEXT) as FakeContext;
    context.events.push("provider:register");
    context.registrationStarted?.();
    await context.registrationGate;
  }

  boot(context: InvocationContext<FakeContext>): void {
    context.applicationContext?.events.push("provider:boot");
  }
}

const fakeRegistryConsumer = defineRuntimeRegistryConsumer<"fake.registry", FakeContext>({
  id: "fake.registry",
  consume(registry, context): void {
    context.applicationContext.events.push("registry:consume");
    for (const plan of registry.methods) {
      const topic = (plan.data as { readonly topic: string }).topic;
      context.applicationContext.host.register(
        topic,
        (argumentsList) => context.invoke(plan, argumentsList),
      );
    }
  },
});

interface FakeAdapterOptions {
  readonly configureNative?: NativeObjectConfigurationCallback<FakeHost>;
}

class FakeAdapter extends Adapter<FakeContext> {
  static readonly compiler = FAKE_COMPILER_DESCRIPTOR;

  attachedApplication: Application | undefined;
  preparedContext: FakeContext | undefined;

  constructor(private readonly options: FakeAdapterOptions = {}) {
    super({
      providers: [FakeAdapterProvider],
      parameterResolvers: [DELIVERY_RESOLVER],
      registryConsumers: [fakeRegistryConsumer],
    });
  }

  protected override onAttach(application: Application): void {
    this.attachedApplication = application;
  }

  protected override async prepareHost(context: AdapterPreparationContext): Promise<FakeContext> {
    if (context.hasManualContext) {
      this.preparedContext = context.manualContext as FakeContext;
      this.preparedContext.events.push("host:manual");
      return this.preparedContext;
    }
    const host = new FakeHost();
    const prepared = {
      host,
      delivery: { id: "delivery-1" },
      events: ["host:prepare"],
    } satisfies FakeContext;
    await this.options.configureNative?.(host);
    prepared.events.push("native:configured");
    this.preparedContext = prepared;
    return prepared;
  }

  protected override startHost(context: AdapterHostContext<FakeContext>): void {
    context.applicationContext.events.push("host:start");
    context.applicationContext.host.accepting = true;
  }
}

@Consumer("orders")
class OrderConsumer {
  @Subscribe("orders.created")
  handle(orderId: string, @Delivery() delivery: FakeContext["delivery"]): object {
    return { orderId, delivery };
  }
}

const orderClassMetadata = getManagedClassMetadata(OrderConsumer);
const orderMethodMetadata = getManagedMethodMetadata(OrderConsumer.prototype, "handle");
const orderDeliveryMetadata = getParameterInjectorMetadata(OrderConsumer.prototype, "handle", 1);

const ORDER_PLAN = defineManagedMethodPlan({
  kind: SUBSCRIBE_KIND,
  ownerKind: CONSUMER_KIND,
  target: OrderConsumer,
  method: "handle",
  data: orderMethodMetadata?.data as { readonly topic: string },
  parameters: [
    { source: "transport", methodIndex: 0, argumentIndex: 0, optional: false },
    {
      source: "resolver",
      methodIndex: 1,
      resolverId: orderDeliveryMetadata?.resolverId as typeof DELIVERY_RESOLVER.id,
      data: orderDeliveryMetadata?.data,
    },
  ],
});

const ORDER_REGISTRY = defineRuntimeRegistry({
  classes: [{
    kind: CONSUMER_KIND,
    target: OrderConsumer,
    data: orderClassMetadata?.data,
  }],
  methods: [ORDER_PLAN],
});

function defineFakeApplication(adapter = new FakeAdapter()): Application<FakeContext> {
  return defineApp()
    .withAdapter(adapter)
    .withConventionBindings((container) => {
      container.transient(OrderConsumer);
    })
    .withRuntimeRegistry(ORDER_REGISTRY);
}

describe("Milestone 6 — class-based adapter attachment and lifecycle", () => {
  it("requires an Adapter class instance and attaches the same existing Application", () => {
    const app = defineApp();
    const adapter = new FakeAdapter();

    const configured = app.withAdapter(adapter);

    expect(configured).toBe(app);
    expect(adapter.attachedApplication).toBe(app);
    expect(() => defineApp().withAdapter({} as Adapter)).toThrow(
      /instance of a class extending Adapter/i,
    );
  });

  it("enforces one primary adapter and rejects reuse across Applications", () => {
    const first = new FakeAdapter();
    const second = new FakeAdapter();
    const app = defineApp().withAdapter(first);

    expect(() => app.withAdapter(second)).toThrow(/one primary host adapter/i);
    expect(() => defineApp().withAdapter(first)).toThrow(/already attached/i);
  });

  it("rejects adapter configuration after startup begins", async () => {
    const app = defineApp();
    await app.start();

    expect(() => app.withAdapter(new FakeAdapter())).toThrow(ApplicationStateError);
  });

  it("rolls back attachment identity when an adapter onAttach hook fails", () => {
    const descriptor = defineAdapterCompilerDescriptor({ id: "flaky.host" });
    class FlakyAdapter extends Adapter<object> {
      static readonly compiler = descriptor;
      shouldFail = true;
      constructor() { super(); }
      protected override onAttach(): void {
        if (this.shouldFail) {
          throw new Error("attach failed");
        }
      }
      protected override prepareHost(): object { return {}; }
    }
    const adapter = new FlakyAdapter();

    expect(() => defineApp().withAdapter(adapter)).toThrow("attach failed");
    adapter.shouldFail = false;
    expect(defineApp().withAdapter(adapter)).toBeInstanceOf(Application);
  });

  it("prepares context, stores it before the adapter Provider, connects metadata, then starts", async () => {
    const adapter = new FakeAdapter();
    const app = defineFakeApplication(adapter);

    await app.start();

    const context = adapter.preparedContext as FakeContext;
    expect(app.rootContainer.get(APPLICATION_CONTEXT)).toBe(context);
    expect(context.events).toEqual([
      "host:prepare",
      "native:configured",
      "provider:register",
      "registry:consume",
      "host:start",
    ]);
    expect(context.host.handlers.has("orders.created")).toBe(true);
    expect(app.state).toBe("running");
  });

  it("exposes compiler metadata statically and runs validation hooks after context preparation", async () => {
    const validationHook = defineAdapterValidationHook<"fake.validate", FakeContext>({
      id: "fake.validate",
      validate(context): void {
        expect(context.rootContainer.get(APPLICATION_CONTEXT)).toBe(context.applicationContext);
        expect(context.registry).toBe(ORDER_REGISTRY);
        context.applicationContext.events.push("adapter:validate");
      },
    });
    class ValidatedAdapter extends Adapter<FakeContext> {
      static readonly compiler = FAKE_COMPILER_DESCRIPTOR;
      constructor() {
        super({
          providers: [FakeAdapterProvider],
          parameterResolvers: [DELIVERY_RESOLVER],
          validationHooks: [validationHook],
        });
      }
      protected override prepareHost(): FakeContext {
        return { host: new FakeHost(), delivery: { id: "validated" }, events: ["host:prepare"] };
      }
    }
    const adapter = new ValidatedAdapter();
    const app = defineApp().withAdapter(adapter).withRuntimeRegistry(ORDER_REGISTRY);

    expect(ValidatedAdapter.compiler.metadataHandlers).toEqual([FAKE_METADATA_HANDLER]);
    expect(ValidatedAdapter.compiler.metadataHandlers[0]?.data).toEqual({
      category: "subscription",
    });
    await app.start();
    const context = app.rootContainer.get(APPLICATION_CONTEXT) as FakeContext;
    expect(context.events).toEqual([
      "host:prepare",
      "adapter:validate",
      "provider:register",
    ]);
  });

  it("passes the real native host object to the typed configuration callback", async () => {
    let callbackHost: FakeHost | undefined;
    const adapter = new FakeAdapter({
      configureNative(host) {
        callbackHost = host;
      },
    });

    await defineFakeApplication(adapter).start();

    expect(callbackHost).toBe(adapter.preparedContext?.host);
    expect(callbackHost).toBeInstanceOf(FakeHost);
  });

  it("does not accept host traffic until Provider registration and registry connection complete", async () => {
    const gate = deferred();
    const registrationStarted = deferred();
    const existingHost = new FakeHost();
    const context: FakeContext = {
      host: existingHost,
      delivery: { id: "gated" },
      events: [],
      registrationGate: gate.promise,
      registrationStarted: registrationStarted.resolve,
    };
    const adapter = new FakeAdapter();
    const app = defineApp()
      .withContext(context)
      .withAdapter(adapter)
      .withConventionBindings((container) => {
        container.transient(OrderConsumer);
      })
      .withRuntimeRegistry(ORDER_REGISTRY);

    const starting = app.start();
    await registrationStarted.promise;

    expect(app.state).toBe("starting");
    expect(context.events).toEqual(["host:manual", "provider:register"]);
    expect(context.host.accepting).toBe(false);
    await expect(context.host.invoke("orders.created", "order-1")).rejects.toThrow(
      /not accepting managed traffic/i,
    );

    gate.resolve();
    await starting;
    expect(context.events).toEqual([
      "host:manual",
      "provider:register",
      "registry:consume",
      "host:start",
    ]);
    expect(context.host.accepting).toBe(true);
  });
});

describe("Milestone 6 — generic extensions and runtime invocation", () => {
  it("delivers fake generated class/method metadata to the adapter consumer", async () => {
    let received: RuntimeRegistry | undefined;
    const captureConsumer = defineRuntimeRegistryConsumer<"capture.registry", FakeContext>({
      id: "capture.registry",
      consume(registry): void {
        received = registry;
      },
    });

    class CapturingAdapter extends Adapter<FakeContext> {
      static readonly compiler = FAKE_COMPILER_DESCRIPTOR;
      constructor() {
        super({
          providers: [FakeAdapterProvider],
          parameterResolvers: [DELIVERY_RESOLVER],
          registryConsumers: [captureConsumer],
        });
      }
      protected override prepareHost(): FakeContext {
        return { host: new FakeHost(), delivery: { id: "capture" }, events: [] };
      }
    }

    const app = defineApp()
      .withAdapter(new CapturingAdapter())
      .withConventionBindings((container) => {
        container.transient(OrderConsumer);
      })
      .withRuntimeRegistry(ORDER_REGISTRY);
    await app.start();

    expect(received).toBe(ORDER_REGISTRY);
    expect(received?.classes[0]).toMatchObject({
      kind: CONSUMER_KIND,
      target: OrderConsumer,
      data: { name: "orders" },
    });
    expect(received?.methods[0]).toBe(ORDER_PLAN);
    expect(received?.methods[0]?.data).toEqual({ topic: "orders.created" });
  });

  it("invokes a fake managed method with a caller-invisible parameter injector", async () => {
    const adapter = new FakeAdapter();
    const app = defineFakeApplication(adapter);
    await app.start();

    await expect(
      adapter.preparedContext?.host.invoke("orders.created", "order-123"),
    ).resolves.toEqual({
      orderId: "order-123",
      delivery: { id: "delivery-1" },
    });
    expect(adapter.preparedContext?.events).toContain("provider:boot");
    await expect(
      adapter.preparedContext?.host.invoke(
        "orders.created",
        "order-123",
        { id: "caller-cannot-own-this" },
      ),
    ).rejects.toThrow(/expects 1 caller argument.*received 2/i);
  });

  it("rejects a managed method decorator placed on a disallowed class kind", () => {
    @Controller("wrong")
    class WrongOwner {
      @Subscribe("orders.wrong")
      handle(): void {}
    }

    expect(() => defineManagedMethodPlan({
      kind: SUBSCRIBE_KIND,
      ownerKind: CONTROLLER_KIND,
      target: WrongOwner,
      method: "handle",
      data: { topic: "orders.wrong" },
      parameters: [],
    })).toThrow(/not allowed on owning class kind "core.controller"/i);
  });

  it("supports the manual withContext(existingContext).start() path", async () => {
    const existingContext: FakeContext = {
      host: new FakeHost(),
      delivery: { id: "existing-delivery" },
      events: [],
    };
    let callbackRuns = 0;
    const adapter = new FakeAdapter({ configureNative: () => { callbackRuns += 1; } });
    const app = defineApp()
      .withContext(existingContext)
      .withAdapter(adapter)
      .withConventionBindings((container) => {
        container.transient(OrderConsumer);
      })
      .withRuntimeRegistry(ORDER_REGISTRY);

    await app.start();

    expect(adapter.preparedContext).toBe(existingContext);
    expect(app.rootContainer.get(APPLICATION_CONTEXT)).toBe(existingContext);
    expect(callbackRuns).toBe(0);
    await expect(existingContext.host.invoke("orders.created", "manual-order")).resolves.toEqual({
      orderId: "manual-order",
      delivery: { id: "existing-delivery" },
    });
  });

  it("keeps fake adapter identities out of Core and Vite production source", () => {
    const root = fileURLToPath(new URL("../..", import.meta.url));
    const coreIndex = readFileSync(`${root}/packages/core/src/index.ts`, "utf8");
    const viteIndex = readFileSync(`${root}/packages/vite/src/index.ts`, "utf8");

    expect(coreIndex).not.toContain("fake.consumer");
    expect(coreIndex).not.toContain("fake.subscribe");
    expect(viteIndex).not.toContain("fake.consumer");
    expect(viteIndex).not.toContain("fake.subscribe");
  });
});

describe("Milestone 6 — extension identity and malformed contribution defenses", () => {
  it("enforces namespaced adapter, class, method, injector, and consumer IDs", () => {
    expect(() => defineAdapterCompilerDescriptor({ id: "invalid" as "invalid.name" })).toThrow(
      /namespaced identifier/i,
    );
    expect(() => defineClassKind({
      id: "invalid" as "invalid.name",
      injectable: true,
      autoDiscover: true,
      analyzeConstructor: true,
      managedMethods: true,
    })).toThrow(/namespaced identifier/i);
    expect(() => defineMethodKind({
      id: "invalid" as "invalid.name",
      allowedOn: [CONSUMER_KIND],
      invocable: true,
    })).toThrow(/namespaced identifier/i);
    expect(() => defineParameterInjector({
      id: "invalid" as "invalid.name",
      compilerSymbol: { moduleSpecifier: "test.invalid", exportName: "Invalid" },
      resolverId: DELIVERY_RESOLVER.id,
      createMetadata: () => undefined,
    })).toThrow(/namespaced identifier/i);
    expect(() => defineRuntimeRegistryConsumer({
      id: "invalid" as "invalid.name",
      consume(): void {},
    })).toThrow(/namespaced identifier/i);
  });

  it("rejects a conflicting canonical Core class-kind contribution", () => {
    const shadowController = defineClassKind({
      id: "core.controller",
      injectable: false,
      autoDiscover: false,
      analyzeConstructor: false,
      managedMethods: false,
    });
    const descriptor = defineAdapterCompilerDescriptor({
      id: "shadow.host",
      classKinds: [shadowController],
    });
    class ShadowAdapter extends Adapter<object> {
      static readonly compiler = descriptor;
      constructor() { super(); }
      protected override prepareHost(): object { return {}; }
    }

    expect(() => defineApp().withAdapter(new ShadowAdapter())).toThrow(
      /core\.controller.*different descriptor/i,
    );
  });

  it("rejects a shadow method-kind descriptor at the adapter registry boundary", async () => {
    const shadowSubscribe = defineMethodKind({
      id: "fake.subscribe",
      allowedOn: [CONSUMER_KIND],
      invocable: true,
    });
    const shadowPlan = defineManagedMethodPlan({
      kind: shadowSubscribe,
      ownerKind: CONSUMER_KIND,
      target: OrderConsumer,
      method: "handle",
      data: { topic: "orders.created" },
      parameters: ORDER_PLAN.parameters,
    });
    const app = defineApp()
      .withAdapter(new FakeAdapter())
      .withConventionBindings((container) => {
        container.transient(OrderConsumer);
      })
      .withRuntimeRegistry(defineRuntimeRegistry({
        classes: ORDER_REGISTRY.classes,
        methods: [shadowPlan],
      }));

    await expect(app.start()).rejects.toThrow(/does not use the canonical registered descriptor/i);
    expect(app.state).toBe("failed");
  });

  it("rejects an unregistered method kind before Providers, consumers, or host start", async () => {
    const unregisteredKind = defineMethodKind({
      id: "fake.unregistered-subscribe",
      allowedOn: [CONSUMER_KIND],
      invocable: true,
    });
    const unregisteredPlan = defineManagedMethodPlan({
      kind: unregisteredKind,
      ownerKind: CONSUMER_KIND,
      target: OrderConsumer,
      method: "handle",
      data: { topic: "orders.created" },
      parameters: ORDER_PLAN.parameters,
    });
    const adapter = new FakeAdapter();
    const app = defineApp()
      .withAdapter(adapter)
      .withRuntimeRegistry(defineRuntimeRegistry({
        classes: ORDER_REGISTRY.classes,
        methods: [unregisteredPlan],
      }));

    await expect(app.start()).rejects.toThrow(
      /method kind "fake\.unregistered-subscribe" is not registered for managed invocation/i,
    );
    expect(adapter.preparedContext?.events).toEqual(["host:prepare", "native:configured"]);
    expect(adapter.preparedContext?.host.handlers.size).toBe(0);
    expect(adapter.preparedContext?.host.accepting).toBe(false);
    expect(app.state).toBe("failed");
  });

  it("rejects an undecorated runtime-registry method before host connection", async () => {
    @Consumer("undecorated")
    class UndecoratedConsumer {
      handle(): string {
        return "must-not-run";
      }
    }

    const plan = defineManagedMethodPlan({
      kind: SUBSCRIBE_KIND,
      ownerKind: CONSUMER_KIND,
      target: UndecoratedConsumer,
      method: "handle",
      data: { topic: "orders.undecorated" },
      parameters: [],
    });
    const adapter = new FakeAdapter();
    const app = defineApp()
      .withAdapter(adapter)
      .withRuntimeRegistry(defineRuntimeRegistry({
        classes: [{
          kind: CONSUMER_KIND,
          target: UndecoratedConsumer,
          data: getManagedClassMetadata(UndecoratedConsumer)?.data,
        }],
        methods: [plan],
      }));

    await expect(app.start()).rejects.toThrow(/must have own managed-method decorator metadata/i);
    expect(adapter.preparedContext?.events).toEqual(["host:prepare", "native:configured"]);
    expect(adapter.preparedContext?.host.handlers.size).toBe(0);
    expect(adapter.preparedContext?.host.accepting).toBe(false);
    expect(app.state).toBe("failed");
  });

  it("rejects a runtime plan whose canonical kind differs from its decorator kind", async () => {
    const alternateKind = defineMethodKind({
      id: "fake.alternate-subscribe",
      allowedOn: [CONSUMER_KIND],
      invocable: true,
    });
    const mismatchedPlan = defineManagedMethodPlan({
      kind: alternateKind,
      ownerKind: CONSUMER_KIND,
      target: OrderConsumer,
      method: "handle",
      data: { topic: "orders.created" },
      parameters: ORDER_PLAN.parameters,
    });
    const adapter = new FakeAdapter();
    const app = defineApp()
      .withAdapter(adapter)
      .withManagedMethodKind(alternateKind)
      .withRuntimeRegistry(defineRuntimeRegistry({
        classes: ORDER_REGISTRY.classes,
        methods: [mismatchedPlan],
      }));

    await expect(app.start()).rejects.toThrow(
      /decorator kind "fake\.subscribe" does not match its canonical plan kind "fake\.alternate-subscribe"/i,
    );
    expect(adapter.preparedContext?.events).toEqual(["host:prepare", "native:configured"]);
    expect(adapter.preparedContext?.host.handlers.size).toBe(0);
    expect(adapter.preparedContext?.host.accepting).toBe(false);
    expect(app.state).toBe("failed");
  });

  it("rejects duplicate compiler and runtime extension IDs instead of replacing definitions", () => {
    expect(() => defineAdapterCompilerDescriptor({
      id: "duplicate.host",
      classKinds: [CONSUMER_KIND, CONSUMER_KIND],
    })).toThrow(/class-kind ID.*more than once/i);
    expect(() => defineAdapterCompilerDescriptor({
      id: "duplicate.host",
      parameterInjectors: [Delivery.definition, Delivery.definition],
    })).toThrow(/parameter-injector ID.*more than once/i);

    const conflictingResolver = defineParameterResolver({
      id: "fake.delivery",
      resolve: () => undefined,
    });
    expect(() => {
      class DuplicateRuntimeAdapter extends Adapter<FakeContext> {
        static readonly compiler = FAKE_COMPILER_DESCRIPTOR;
        constructor() {
          super({ parameterResolvers: [DELIVERY_RESOLVER, conflictingResolver] });
        }
      }
      return new DuplicateRuntimeAdapter();
    }).toThrow(/parameter resolver ID.*more than once/i);
  });

  it("rejects missing compiler descriptors, missing injector resolvers, and invalid method owners", () => {
    class MissingCompilerAdapter extends Adapter<object> {
      constructor() { super(); }
      protected override prepareHost(): object { return {}; }
    }
    expect(() => defineApp().withAdapter(new MissingCompilerAdapter())).toThrow(
      /must declare its own static compiler descriptor/i,
    );

    class MissingResolverAdapter extends Adapter<object> {
      static readonly compiler = FAKE_COMPILER_DESCRIPTOR;
      constructor() { super(); }
      protected override prepareHost(): object { return {}; }
    }
    expect(() => defineApp().withAdapter(new MissingResolverAdapter())).toThrow(
      /parameter injector.*requires runtime resolver/i,
    );

    const invalidMethodKind = defineMethodKind({
      id: "invalid.service-method",
      allowedOn: [SERVICE_KIND],
      invocable: true,
    });
    const invalidDescriptor = defineAdapterCompilerDescriptor({
      id: "invalid.owner-host",
      methodKinds: [invalidMethodKind],
    });
    class InvalidOwnerAdapter extends Adapter<object> {
      static readonly compiler = invalidDescriptor;
      constructor() { super(); }
      protected override prepareHost(): object { return {}; }
    }
    expect(() => defineApp().withAdapter(new InvalidOwnerAdapter())).toThrow(
      /does not allow managed methods/i,
    );
  });

  it("rejects malformed and duplicate generated runtime registry entries before host start", async () => {
    const duplicateRegistry = defineRuntimeRegistry({
      classes: [...ORDER_REGISTRY.classes, ...ORDER_REGISTRY.classes],
      methods: [ORDER_PLAN],
    });
    const adapter = new FakeAdapter();
    const app = defineApp()
      .withAdapter(adapter)
      .withRuntimeRegistry(duplicateRegistry);

    await expect(app.start()).rejects.toThrow(/duplicate managed class target/i);
    expect(adapter.preparedContext?.host.accepting).toBe(false);
    expect(app.state).toBe("failed");
  });

  it("fails clearly when the base manual adapter has no context", async () => {
    const descriptor = defineAdapterCompilerDescriptor({ id: "manual.only" });
    class ManualOnlyAdapter extends Adapter<object> {
      static readonly compiler = descriptor;
      constructor() { super(); }
    }
    const app = defineApp().withAdapter(new ManualOnlyAdapter());

    await expect(app.start()).rejects.toThrow(/requires a host context/i);
    expect(app.state).toBe("failed");
  });

  it("moves the Application to failed when final host start fails", async () => {
    const descriptor = defineAdapterCompilerDescriptor({ id: "failing-start.host" });
    class FailingStartAdapter extends Adapter<object> {
      static readonly compiler = descriptor;
      constructor() { super(); }
      protected override prepareHost(): object { return {}; }
      protected override startHost(): never { throw new Error("host start failed"); }
    }
    const app = defineApp().withAdapter(new FailingStartAdapter());

    await expect(app.start()).rejects.toThrow("host start failed");
    expect(app.state).toBe("failed");
    await expect(app.runInvocation(() => undefined)).rejects.toThrow(
      /require a running Application.*failed/i,
    );
  });
});

describe("Bun Milestone 1 — Core-owned adapter shutdown", () => {
  const lifecycleDescriptor = defineAdapterCompilerDescriptor({ id: "lifecycle.host" });

  it("stops a running adapter exactly once and makes shutdown terminal", async () => {
    const events: string[] = [];
    class LifecycleAdapter extends Adapter<object> {
      static readonly compiler = lifecycleDescriptor;
      constructor() { super(); }
      protected override prepareHost(): object {
        events.push("prepare");
        return {};
      }
      protected override startHost(): void { events.push("start"); }
      protected override stopHost(): void { events.push("stop"); }
    }
    const app = defineApp().withAdapter(new LifecycleAdapter());

    await app.start();
    expect(app.state).toBe("running");

    await Promise.all([app.stop(), app.stop()]);

    expect(events).toEqual(["prepare", "start", "stop"]);
    expect(app.state).toBe("stopped");
    expect(app.isRunning).toBe(false);
    await app.stop();
    expect(events).toEqual(["prepare", "start", "stop"]);
    await expect(app.start()).rejects.toThrow(/called once.*stopped/i);
    await expect(app.runInvocation(() => undefined)).rejects.toThrow(
      /require a running Application.*stopped/i,
    );
  });

  it("allows adapters with the default no-op stop hook", async () => {
    class StartOnlyAdapter extends Adapter<object> {
      static readonly compiler = lifecycleDescriptor;
      constructor() { super(); }
      protected override prepareHost(): object { return {}; }
    }
    const app = defineApp().withAdapter(new StartOnlyAdapter());

    await app.start();
    await app.stop();

    expect(app.state).toBe("stopped");
  });

  it("waits for startup before stopping and rejects invocations during cleanup", async () => {
    const startGate = deferred();
    const stopGate = deferred();
    const stopStarted = deferred();
    const events: string[] = [];
    class GatedAdapter extends Adapter<object> {
      static readonly compiler = lifecycleDescriptor;
      constructor() { super(); }
      protected override prepareHost(): object { return {}; }
      protected override async startHost(): Promise<void> {
        events.push("start:begin");
        await startGate.promise;
        events.push("start:end");
      }
      protected override async stopHost(): Promise<void> {
        events.push("stop:begin");
        stopStarted.resolve();
        await stopGate.promise;
        events.push("stop:end");
      }
    }
    const app = defineApp().withAdapter(new GatedAdapter());

    const starting = app.start();
    const stopping = app.stop();
    expect(app.state).toBe("starting");

    startGate.resolve();
    await starting;
    await stopStarted.promise;
    expect(app.state).toBe("stopping");
    await expect(app.runInvocation(() => undefined)).rejects.toThrow(
      /require a running Application.*stopping/i,
    );

    stopGate.resolve();
    await stopping;
    expect(events).toEqual(["start:begin", "start:end", "stop:begin", "stop:end"]);
    expect(app.state).toBe("stopped");
  });

  it("rolls back prepared adapter resources when startup fails", async () => {
    const events: string[] = [];
    class FailingAdapter extends Adapter<object> {
      static readonly compiler = lifecycleDescriptor;
      constructor() { super(); }
      protected override prepareHost(): object {
        events.push("prepare");
        return {};
      }
      protected override startHost(): never {
        events.push("start");
        throw new Error("startup failed");
      }
      protected override stopHost(): void { events.push("stop"); }
    }
    const app = defineApp().withAdapter(new FailingAdapter());

    await expect(app.start()).rejects.toThrow("startup failed");

    expect(events).toEqual(["prepare", "start", "stop"]);
    expect(app.state).toBe("failed");
    await app.stop();
    expect(events).toEqual(["prepare", "start", "stop"]);
  });

  it("preserves startup and rollback errors in an AggregateError", async () => {
    class DoubleFailureAdapter extends Adapter<object> {
      static readonly compiler = lifecycleDescriptor;
      constructor() { super(); }
      protected override prepareHost(): object { return {}; }
      protected override startHost(): never { throw new Error("startup failed"); }
      protected override stopHost(): never { throw new Error("cleanup failed"); }
    }
    const app = defineApp().withAdapter(new DoubleFailureAdapter());

    let received: unknown;
    try {
      await app.start();
    } catch (error) {
      received = error;
    }

    expect(received).toBeInstanceOf(AggregateError);
    expect((received as AggregateError).errors).toEqual([
      expect.objectContaining({ message: "startup failed" }),
      expect.objectContaining({ message: "cleanup failed" }),
    ]);
    expect(app.state).toBe("failed");
  });

  it("moves to failed and reuses the same rejection when normal cleanup fails", async () => {
    const cleanupError = new Error("cleanup failed");
    let stops = 0;
    class FailingStopAdapter extends Adapter<object> {
      static readonly compiler = lifecycleDescriptor;
      constructor() { super(); }
      protected override prepareHost(): object { return {}; }
      protected override stopHost(): never {
        stops += 1;
        throw cleanupError;
      }
    }
    const app = defineApp().withAdapter(new FailingStopAdapter());
    await app.start();

    await expect(app.stop()).rejects.toBe(cleanupError);
    await expect(app.stop()).rejects.toBe(cleanupError);

    expect(stops).toBe(1);
    expect(app.state).toBe("failed");
  });
});
