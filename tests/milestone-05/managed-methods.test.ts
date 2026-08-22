import { describe, expect, it } from "vitest";
import {
  CallerArgumentError,
  CONTROLLER_KIND,
  Container,
  Controller,
  InvocationEngine,
  ManagedClassKindRegistry,
  ManagedMethodPlanError,
  Provider,
  SERVICE_KIND,
  Service,
  UnknownParameterResolverError,
  createParameterResolverId,
  createToken,
  defineApp,
  defineClassKind,
  defineManagedClassDecorator,
  defineManagedMethodPlan,
  defineMethodKind,
  defineParameterResolver,
  type InvocationContext,
  type ManagedMethodMiddleware,
  type ManagedMethodParameterPlan,
  type ParameterResolutionRequest,
} from "@bunwire/core";

const HANDLER_KIND = defineClassKind({
  id: "test.handler",
  injectable: true,
  autoDiscover: true,
  analyzeConstructor: true,
  managedMethods: true,
  registry: true,
});

const ManagedHandler = defineManagedClassDecorator<void, Readonly<Record<string, never>>>({
  id: "test.handler.decorator",
  compilerSymbol: { moduleSpecifier: "test.managed-methods", exportName: "ManagedHandler" },
  kind: HANDLER_KIND,
  createMetadata: () => Object.freeze({}),
});

const COMMAND_KIND = defineMethodKind({
  id: "test.command",
  allowedOn: [HANDLER_KIND],
  invocable: true,
});

describe("Milestone 5 — managed method kinds and plans", () => {
  it("defines a generic method kind with owning-class restrictions and invocability", () => {
    expect(COMMAND_KIND.id).toBe("test.command");
    expect(COMMAND_KIND.allowedOn).toEqual([HANDLER_KIND.id]);
    expect(COMMAND_KIND.invocable).toBe(true);
    expect(Object.isFrozen(COMMAND_KIND)).toBe(true);

    if (false) {
      // @ts-expect-error Method-kind IDs must be namespaced.
      defineMethodKind({ id: "invalid", allowedOn: [HANDLER_KIND], invocable: true });
    }
  });

  it("registers canonical class kinds idempotently and rejects conflicting same-ID descriptors", () => {
    const registry = new ManagedClassKindRegistry([SERVICE_KIND]);
    const shadowServiceKind = defineClassKind({
      id: "core.service",
      injectable: true,
      autoDiscover: true,
      analyzeConstructor: true,
      managedMethods: true,
      registry: true,
    });

    expect(registry.register(SERVICE_KIND)).toBe(registry);
    expect(registry.get(SERVICE_KIND.id)).toBe(SERVICE_KIND);
    expect(() => registry.register(shadowServiceKind)).toThrow(
      /core\.service.*already registered with a different descriptor/i,
    );
  });

  it("cannot bypass Service method restrictions with a conflicting same-ID descriptor", async () => {
    const shadowServiceKind = defineClassKind({
      id: "core.service",
      injectable: true,
      autoDiscover: true,
      analyzeConstructor: true,
      managedMethods: true,
      registry: true,
    });
    const shadowMethodKind = defineMethodKind({
      id: "test.shadow-service-method",
      allowedOn: [shadowServiceKind],
      invocable: true,
    });

    @Service()
    class ProtectedService {
      internal(): string {
        return "must-not-run";
      }
    }

    const plan = defineManagedMethodPlan({
      kind: shadowMethodKind,
      ownerKind: shadowServiceKind,
      target: ProtectedService,
      method: "internal",
      data: undefined,
      parameters: [],
    });
    const app = defineApp().withConventionBindings((container) => {
      container.singleton(ProtectedService);
    });
    await app.start();

    await expect(app.invokeManagedMethod(plan)).rejects.toThrow(
      /core\.service.*canonical registered descriptor/i,
    );
  });

  it("rejects invocation through an unregistered method kind", async () => {
    @ManagedHandler()
    class UnregisteredKindTarget {
      execute(): string {
        return "must-not-run";
      }
    }

    const plan = defineManagedMethodPlan({
      kind: COMMAND_KIND,
      ownerKind: HANDLER_KIND,
      target: UnregisteredKindTarget,
      method: "execute",
      data: undefined,
      parameters: [],
    });
    const app = defineApp()
      .withManagedClassKind(HANDLER_KIND)
      .withConventionBindings((container) => {
        container.transient(UnregisteredKindTarget);
      });
    await app.start();

    await expect(app.invokeManagedMethod(plan)).rejects.toThrow(
      /method kind "test\.command" is not registered for managed invocation/i,
    );
  });

  it("rejects method kinds on disallowed or method-disabled owning class kinds", () => {
    @Controller()
    class WrongOwner {
      execute(): void {}
    }

    expect(() => defineManagedMethodPlan({
      kind: COMMAND_KIND,
      ownerKind: CONTROLLER_KIND,
      target: WrongOwner,
      method: "execute",
      data: undefined,
      parameters: [],
    })).toThrow(/not allowed on owning class kind "core.controller"/i);

    const serviceMethodKind = defineMethodKind({
      id: "test.service-command",
      allowedOn: [SERVICE_KIND],
      invocable: true,
    });

    @Service()
    class MethodDisabledService {
      execute(): void {}
    }

    expect(() => defineManagedMethodPlan({
      kind: serviceMethodKind,
      ownerKind: SERVICE_KIND,
      target: MethodDisabledService,
      method: "execute",
      data: undefined,
      parameters: [],
    })).toThrow(/does not allow managed methods/i);
  });

  it("validates complete, unique real-method and caller-index coordinate systems", () => {
    @ManagedHandler()
    class Target {
      execute(_first: unknown, _second: unknown): void {}
    }

    expect(() => defineManagedMethodPlan({
      kind: COMMAND_KIND,
      ownerKind: HANDLER_KIND,
      target: Target,
      method: "execute",
      data: undefined,
      parameters: [
        { source: "transport", methodIndex: 0, argumentIndex: 0, optional: false },
        { source: "transport", methodIndex: 0, argumentIndex: 1, optional: false },
      ],
    })).toThrow(/duplicate method index 0/i);

    expect(() => defineManagedMethodPlan({
      kind: COMMAND_KIND,
      ownerKind: HANDLER_KIND,
      target: Target,
      method: "execute",
      data: undefined,
      parameters: [
        { source: "transport", methodIndex: 0, argumentIndex: 0, optional: false },
        { source: "transport", methodIndex: 1, argumentIndex: 2, optional: false },
      ],
    })).toThrow(/missing caller argument index 1/i);
  });

  it("rejects malformed runtime parameter records and middleware", () => {
    @ManagedHandler()
    class Target {
      execute(_value: unknown): void {}
    }

    const defineWithParameter = (parameter: unknown) => defineManagedMethodPlan({
      kind: COMMAND_KIND,
      ownerKind: HANDLER_KIND,
      target: Target,
      method: "execute",
      data: undefined,
      parameters: [parameter as ManagedMethodParameterPlan],
    });

    expect(() => defineWithParameter({ source: "unknown", methodIndex: 0 })).toThrow(
      /unknown parameter source "unknown"/i,
    );
    expect(() => defineWithParameter({
      source: "transport",
      methodIndex: 0,
      argumentIndex: 0,
      optional: "false",
    })).toThrow(/must declare a boolean optional value/i);
    expect(() => defineWithParameter({ source: "container", methodIndex: 0 })).toThrow(
      /must declare a valid runtime token/i,
    );
    expect(() => defineWithParameter({
      source: "resolver",
      methodIndex: 0,
      resolverId: "invalid",
    })).toThrow(/must declare a namespaced resolver ID/i);
    expect(() => defineManagedMethodPlan({
      kind: COMMAND_KIND,
      ownerKind: HANDLER_KIND,
      target: Target,
      method: "execute",
      data: undefined,
      parameters: [{ source: "context", methodIndex: 0 }],
      middleware: [42 as unknown as ManagedMethodMiddleware],
    })).toThrow(/middleware entries must be callable/i);
  });
});

describe("Milestone 5 — prebuilt parameter reconstruction", () => {
  it("reconstructs an arbitrary scrambled plan using independent method and caller indexes", async () => {
    const DEPENDENCY = createToken<string>("method-plan-dependency");
    const resolver = defineParameterResolver<"test.plan-value", { readonly value: string }>({
      id: "test.plan-value",
      resolve: ({ parameter }) => parameter.data?.value,
    });

    @ManagedHandler()
    class ScrambledTarget {
      execute(
        callerOne: unknown,
        dependency: unknown,
        context: unknown,
        resolved: unknown,
        callerZero: unknown,
      ): readonly unknown[] {
        return [callerOne, dependency, context, resolved, callerZero];
      }
    }

    const plan = defineManagedMethodPlan({
      kind: COMMAND_KIND,
      ownerKind: HANDLER_KIND,
      target: ScrambledTarget,
      method: "execute",
      data: { label: "scrambled" },
      parameters: [
        { source: "transport", methodIndex: 4, argumentIndex: 0, optional: false },
        { source: "resolver", methodIndex: 3, resolverId: resolver.id, data: { value: "resolver" } },
        { source: "transport", methodIndex: 0, argumentIndex: 1, optional: false },
        { source: "context", methodIndex: 2 },
        { source: "container", methodIndex: 1, token: DEPENDENCY },
      ],
    });
    const app = defineApp()
      .withManagedClassKind(HANDLER_KIND)
      .withManagedMethodKind(COMMAND_KIND)
      .withConventionBindings((container) => {
        container.transient(ScrambledTarget).value(DEPENDENCY, "container");
      })
      .withParameterResolver(resolver);
    await app.start();

    const result = await app.invokeManagedMethod<readonly unknown[]>(
      plan,
      ["caller-zero", "caller-one"],
    );

    expect(result[0]).toBe("caller-one");
    expect(result[1]).toBe("container");
    expect(result[2]).toMatchObject({ application: app, container: expect.any(Container) });
    expect(result[3]).toBe("resolver");
    expect(result[4]).toBe("caller-zero");
  });

  it("interleaves multiple container parameters with caller arguments", async () => {
    const FIRST = createToken<string>("first-container-value");
    const SECOND = createToken<string>("second-container-value");

    @ManagedHandler()
    class ContainerTarget {
      execute(...values: unknown[]): unknown[] {
        return values;
      }
    }

    const plan = defineManagedMethodPlan({
      kind: COMMAND_KIND,
      ownerKind: HANDLER_KIND,
      target: ContainerTarget,
      method: "execute",
      data: undefined,
      parameters: [
        { source: "container", methodIndex: 3, token: SECOND },
        { source: "transport", methodIndex: 0, argumentIndex: 0, optional: false },
        { source: "transport", methodIndex: 4, argumentIndex: 2, optional: false },
        { source: "container", methodIndex: 1, token: FIRST },
        { source: "transport", methodIndex: 2, argumentIndex: 1, optional: false },
      ],
    });
    const app = defineApp()
      .withManagedClassKind(HANDLER_KIND)
      .withManagedMethodKind(COMMAND_KIND)
      .withConventionBindings((container) => {
        container
          .transient(ContainerTarget)
          .value(FIRST, "first-container")
          .value(SECOND, "second-container");
      });
    await app.start();

    await expect(app.invokeManagedMethod(plan, ["a", "b", "c"])).resolves.toEqual([
      "a",
      "first-container",
      "b",
      "second-container",
      "c",
    ]);
  });

  it("interleaves parameter-resolver values with caller and container values", async () => {
    const SHARED = createToken<string>("shared-container-value");
    const resolver = defineParameterResolver<"test.slot", { readonly slot: string }>({
      id: "test.slot",
      resolve: async ({ parameter, context }) => {
        await Promise.resolve();
        return `${parameter.data?.slot}:${context.id}`;
      },
    });

    @ManagedHandler()
    class ResolverTarget {
      execute(...values: unknown[]): unknown[] {
        return values;
      }
    }

    const plan = defineManagedMethodPlan({
      kind: COMMAND_KIND,
      ownerKind: HANDLER_KIND,
      target: ResolverTarget,
      method: "execute",
      data: undefined,
      parameters: [
        { source: "resolver", methodIndex: 3, resolverId: resolver.id, data: { slot: "right" } },
        { source: "transport", methodIndex: 4, argumentIndex: 1, optional: false },
        { source: "container", methodIndex: 2, token: SHARED },
        { source: "transport", methodIndex: 0, argumentIndex: 0, optional: false },
        { source: "resolver", methodIndex: 1, resolverId: resolver.id, data: { slot: "left" } },
      ],
    });
    const app = defineApp()
      .withManagedClassKind(HANDLER_KIND)
      .withManagedMethodKind(COMMAND_KIND)
      .withConventionBindings((container) => {
        container.transient(ResolverTarget).value(SHARED, "container");
      })
      .withParameterResolver(resolver);
    await app.start();

    const result = await app.invokeManagedMethod<unknown[]>(plan, ["caller-a", "caller-b"]);

    expect(result).toEqual([
      "caller-a",
      expect.stringMatching(/^left:\d+$/),
      "container",
      expect.stringMatching(/^right:\d+$/),
      "caller-b",
    ]);
  });
});

describe("Milestone 5 — caller validation and resolver diagnostics", () => {
  it("accepts required-only and required-plus-optional caller arguments and rejects invalid counts", async () => {
    const INJECTED = createToken<string>("optional-plan-injected");

    @ManagedHandler()
    class OptionalTarget {
      execute(required: unknown, injected: unknown, optional?: unknown): unknown[] {
        return [required, injected, optional];
      }
    }

    const plan = defineManagedMethodPlan({
      kind: COMMAND_KIND,
      ownerKind: HANDLER_KIND,
      target: OptionalTarget,
      method: "execute",
      data: undefined,
      parameters: [
        { source: "transport", methodIndex: 2, argumentIndex: 1, optional: true },
        { source: "container", methodIndex: 1, token: INJECTED },
        { source: "transport", methodIndex: 0, argumentIndex: 0, optional: false },
      ],
    });
    const app = defineApp()
      .withManagedClassKind(HANDLER_KIND)
      .withManagedMethodKind(COMMAND_KIND)
      .withConventionBindings((container) => {
        container.transient(OptionalTarget).value(INJECTED, "injected");
      });
    await app.start();

    await expect(app.invokeManagedMethod(plan, ["required"])).resolves.toEqual([
      "required",
      "injected",
      undefined,
    ]);
    await expect(app.invokeManagedMethod(plan, ["required", "optional"])).resolves.toEqual([
      "required",
      "injected",
      "optional",
    ]);
    await expect(app.invokeManagedMethod(plan, [])).rejects.toMatchObject({
      name: "CallerArgumentError",
      minimum: 1,
      maximum: 2,
      received: 0,
    });
    await expect(app.invokeManagedMethod(plan, [1, 2, 3])).rejects.toBeInstanceOf(CallerArgumentError);
  });

  it("uses the highest required caller index when an earlier caller position is optional", async () => {
    @ManagedHandler()
    class DefaultBeforeRequiredTarget {
      execute(optional: unknown = "default", required: unknown): unknown[] {
        return [optional, required];
      }
    }

    const plan = defineManagedMethodPlan({
      kind: COMMAND_KIND,
      ownerKind: HANDLER_KIND,
      target: DefaultBeforeRequiredTarget,
      method: "execute",
      data: undefined,
      parameters: [
        { source: "transport", methodIndex: 0, argumentIndex: 0, optional: true },
        { source: "transport", methodIndex: 1, argumentIndex: 1, optional: false },
      ],
    });
    const app = defineApp()
      .withManagedClassKind(HANDLER_KIND)
      .withManagedMethodKind(COMMAND_KIND)
      .withConventionBindings((container) => {
        container.transient(DefaultBeforeRequiredTarget);
      });
    await app.start();

    await expect(app.invokeManagedMethod(plan, [undefined, "required"])).resolves.toEqual([
      "default",
      "required",
    ]);
    await expect(app.invokeManagedMethod(plan, ["only-one"])).rejects.toMatchObject({
      minimum: 2,
      maximum: 2,
    });
  });

  it("fails clearly for an unknown parameter resolver ID", async () => {
    @ManagedHandler()
    class MissingResolverTarget {
      execute(_value: unknown): void {}
    }

    const missingId = createParameterResolverId("test.missing-resolver");
    const plan = defineManagedMethodPlan({
      kind: COMMAND_KIND,
      ownerKind: HANDLER_KIND,
      target: MissingResolverTarget,
      method: "execute",
      data: undefined,
      parameters: [
        { source: "resolver", methodIndex: 0, resolverId: missingId },
      ],
    });
    const app = defineApp()
      .withManagedClassKind(HANDLER_KIND)
      .withManagedMethodKind(COMMAND_KIND)
      .withConventionBindings((container) => {
        container.transient(MissingResolverTarget);
      });
    await app.start();

    await expect(app.invokeManagedMethod(plan)).rejects.toBeInstanceOf(UnknownParameterResolverError);
    await expect(app.invokeManagedMethod(plan)).rejects.toThrow(
      /No parameter resolver.*test\.missing-resolver.*Register the resolver/i,
    );
  });
});

describe("Milestone 5 — middleware and result semantics", () => {
  it("Promise-normalizes both synchronous and asynchronous target results", async () => {
    @ManagedHandler()
    class ResultTarget {
      synchronous(): string {
        return "sync";
      }

      async asynchronous(): Promise<string> {
        await Promise.resolve();
        return "async";
      }
    }

    const synchronousPlan = defineManagedMethodPlan({
      kind: COMMAND_KIND,
      ownerKind: HANDLER_KIND,
      target: ResultTarget,
      method: "synchronous",
      data: undefined,
      parameters: [],
    });
    const asynchronousPlan = defineManagedMethodPlan({
      kind: COMMAND_KIND,
      ownerKind: HANDLER_KIND,
      target: ResultTarget,
      method: "asynchronous",
      data: undefined,
      parameters: [],
    });
    const app = defineApp()
      .withManagedClassKind(HANDLER_KIND)
      .withManagedMethodKind(COMMAND_KIND)
      .withConventionBindings((container) => {
        container.singleton(ResultTarget);
      });
    await app.start();

    await expect(app.invokeManagedMethod<string>(synchronousPlan)).resolves.toBe("sync");
    await expect(app.invokeManagedMethod<string>(asynchronousPlan)).resolves.toBe("async");
  });

  it("wraps invocation middleware in attachment order and Promise-normalizes results", async () => {
    const events: string[] = [];
    const outer: ManagedMethodMiddleware = async (invocation, next) => {
      events.push(`outer:before:${String(invocation.plan.data)}`);
      const result = await next();
      events.push("outer:after");
      return `outer(${String(result)})`;
    };
    const inner: ManagedMethodMiddleware = async (invocation, next) => {
      events.push(`inner:before:${String(invocation.arguments[0])}`);
      const result = await next();
      events.push("inner:after");
      return `inner(${String(result)})`;
    };

    @ManagedHandler()
    class MiddlewareTarget {
      execute(value: unknown): string {
        events.push("method");
        return `method:${String(value)}`;
      }
    }

    const plan = defineManagedMethodPlan({
      kind: COMMAND_KIND,
      ownerKind: HANDLER_KIND,
      target: MiddlewareTarget,
      method: "execute",
      data: "metadata",
      parameters: [
        { source: "transport", methodIndex: 0, argumentIndex: 0, optional: false },
      ],
      middleware: [outer, inner],
    });
    const app = defineApp()
      .withManagedClassKind(HANDLER_KIND)
      .withManagedMethodKind(COMMAND_KIND)
      .withConventionBindings((container) => {
        container.transient(MiddlewareTarget);
      });
    await app.start();

    await expect(app.invokeManagedMethod<string>(plan, ["value"])).resolves.toBe(
      "outer(inner(method:value))",
    );
    expect(events).toEqual([
      "outer:before:metadata",
      "inner:before:value",
      "method",
      "inner:after",
      "outer:after",
    ]);
  });

  it("propagates method failures through the async invocation result", async () => {
    @ManagedHandler()
    class FailingTarget {
      execute(): never {
        throw new Error("method failed");
      }
    }

    const plan = defineManagedMethodPlan({
      kind: COMMAND_KIND,
      ownerKind: HANDLER_KIND,
      target: FailingTarget,
      method: "execute",
      data: undefined,
      parameters: [],
    });
    const app = defineApp()
      .withManagedClassKind(HANDLER_KIND)
      .withManagedMethodKind(COMMAND_KIND)
      .withConventionBindings((container) => {
        container.transient(FailingTarget);
      });
    await app.start();

    await expect(app.invokeManagedMethod(plan)).rejects.toThrow("method failed");
  });

  it("rejects invocation of a metadata-only method kind", async () => {
    const metadataOnlyKind = defineMethodKind({
      id: "test.metadata-only",
      allowedOn: [HANDLER_KIND],
      invocable: false,
    });

    @ManagedHandler()
    class MetadataTarget {
      inspect(): void {}
    }

    const plan = defineManagedMethodPlan({
      kind: metadataOnlyKind,
      ownerKind: HANDLER_KIND,
      target: MetadataTarget,
      method: "inspect",
      data: undefined,
      parameters: [],
    });
    const engine = new InvocationEngine()
      .registerClassKind(HANDLER_KIND)
      .registerMethodKind(metadataOnlyKind);
    const app = defineApp().withConventionBindings((container) => {
      container.transient(MetadataTarget);
    });
    await app.start();

    await expect(app.runInvocation((context) => engine.invoke(plan, context, []))).rejects.toThrow(
      /metadata-only and cannot be invoked/i,
    );
  });
});

describe("Milestone 5 — platform-independent fake kind integration", () => {
  it("invokes a fake queue method kind end to end using only Core contracts", async () => {
    const CONSUMER_KIND = defineClassKind({
      id: "fake.consumer",
      injectable: true,
      autoDiscover: true,
      analyzeConstructor: true,
      managedMethods: true,
      registry: true,
    });
    const Consumer = defineManagedClassDecorator<void, Readonly<Record<string, never>>>({
      id: "fake.consumer.decorator",
      compilerSymbol: { moduleSpecifier: "test.managed-methods", exportName: "Consumer" },
      kind: CONSUMER_KIND,
      createMetadata: () => Object.freeze({}),
    });
    const SUBSCRIBE_KIND = defineMethodKind({
      id: "fake.subscribe",
      allowedOn: [CONSUMER_KIND],
      invocable: true,
    });
    const EVENT = createToken<{ readonly payload: string }>("fake-event");
    const AUDIT = createToken<string>("fake-audit");
    const eventResolver = defineParameterResolver({
      id: "fake.event",
      resolve: ({ context }: ParameterResolutionRequest) => context.container.get(EVENT),
    });

    @Provider()
    class FakeEventProvider {
      register(): void {}

      boot(context: InvocationContext): void {
        context.container.value(EVENT, { payload: "created" });
      }
    }

    @Consumer()
    class OrderConsumer {
      consume(orderId: unknown, audit: unknown, event: unknown): object {
        return { orderId, audit, event };
      }
    }

    const plan = defineManagedMethodPlan({
      kind: SUBSCRIBE_KIND,
      ownerKind: CONSUMER_KIND,
      target: OrderConsumer,
      method: "consume",
      data: { topic: "orders.created" },
      parameters: [
        { source: "resolver", methodIndex: 2, resolverId: eventResolver.id },
        { source: "transport", methodIndex: 0, argumentIndex: 0, optional: false },
        { source: "container", methodIndex: 1, token: AUDIT },
      ],
    });
    const app = defineApp()
      .withManagedClassKind(CONSUMER_KIND)
      .withManagedMethodKind(SUBSCRIBE_KIND)
      .withConventionBindings((container) => {
        container.transient(OrderConsumer).value(AUDIT, "audited");
      })
      .withProviders(FakeEventProvider)
      .withParameterResolver(eventResolver);
    await app.start();

    const result = await app.invokeManagedMethod<object>(plan, ["order-123"]);

    expect(result).toEqual({
      orderId: "order-123",
      audit: "audited",
      event: { payload: "created" },
    });
  });
});
