import { describe, expect, expectTypeOf, it } from "vitest";
import {
  defineClassKind,
  defineManagedClassDecorator,
  getManagedClassMetadata,
  type ManagedClassKind,
} from "@bunwire/core";

describe("managed class kinds", () => {
  it("allows unrelated class kinds to coexist without a central enum", () => {
    const serviceLike = defineClassKind({
      id: "example.service",
      injectable: true,
      autoDiscover: true,
      analyzeConstructor: true,
      managedMethods: false,
    });
    const consumerLike = defineClassKind({
      id: "queue.consumer",
      injectable: true,
      autoDiscover: true,
      analyzeConstructor: true,
      managedMethods: true,
      registry: true,
    });

    expect(serviceLike.id).toBe("example.service");
    expect(consumerLike.id).toBe("queue.consumer");
    expect(serviceLike).not.toBe(consumerLike);
  });

  it("requires stable lowercase namespaced IDs", () => {
    expect(() => defineClassKind({
      // Runtime validation also protects dynamically sourced definitions.
      id: "invalid" as "invalid.namespace",
      injectable: false,
      autoDiscover: false,
      analyzeConstructor: false,
      managedMethods: false,
    })).toThrow(/namespaced identifier/);

    if (false) {
      defineClassKind({
        // @ts-expect-error A class-kind ID must be namespaced at compile time.
        id: "invalid",
        injectable: false,
        autoDiscover: false,
        analyzeConstructor: false,
        managedMethods: false,
      });
    }
  });

  it("configures injectability independently from managed methods", () => {
    const kind = defineClassKind({
      id: "example.endpoint",
      injectable: false,
      autoDiscover: true,
      analyzeConstructor: false,
      managedMethods: true,
    });

    expect(kind.injectable).toBe(false);
    expect(kind.managedMethods).toBe(true);
  });

  it("supports registry-managed classes without managed methods", () => {
    const kind = defineClassKind({
      id: "example.lifecycle",
      injectable: false,
      autoDiscover: true,
      analyzeConstructor: false,
      managedMethods: false,
      registry: true,
    });

    expect(kind.registry).toBe(true);
    expect(kind.managedMethods).toBe(false);
  });
});

describe("managed class decorators", () => {
  it("lets an adapter define and apply a descriptor using only Core APIs", () => {
    const subscriberKind = defineClassKind({
      id: "events.subscriber",
      injectable: true,
      autoDiscover: true,
      analyzeConstructor: true,
      managedMethods: true,
      registry: true,
    });
    const Subscriber = defineManagedClassDecorator<{ topic: string }, { topic: string }>({
      id: "events.subscriber-decorator",
      compilerSymbol: { moduleSpecifier: "test.events", exportName: "Subscriber" },
      kind: subscriberKind,
      createMetadata: (options) => Object.freeze({ topic: options.topic }),
    });
    class UserEvents {}

    Subscriber({ topic: "user.created" })(UserEvents);

    expect(Subscriber.definition.kind).toBe(subscriberKind);
    expect(getManagedClassMetadata(UserEvents)).toEqual({
      decoratorId: "events.subscriber-decorator",
      kindId: "events.subscriber",
      target: UserEvents,
      data: { topic: "user.created" },
    });
    expectTypeOf(subscriberKind).toMatchTypeOf<ManagedClassKind>();
  });

  it("keeps decorator identity separate from class-kind meaning", () => {
    const kind = defineClassKind({
      id: "example.worker",
      injectable: true,
      autoDiscover: true,
      analyzeConstructor: true,
      managedMethods: false,
    });
    const Worker = defineManagedClassDecorator<void, undefined>({
      id: "example.worker-decorator",
      compilerSymbol: { moduleSpecifier: "test.example", exportName: "Worker" },
      kind,
      createMetadata: () => undefined,
    });
    class BackgroundWorker {}

    Worker()(BackgroundWorker);
    const metadata = getManagedClassMetadata(BackgroundWorker);

    expect(metadata?.decoratorId).toBe("example.worker-decorator");
    expect(metadata?.kindId).toBe("example.worker");
    expect(metadata).not.toHaveProperty("sourceFile");
    expect(metadata).not.toHaveProperty("vite");
  });

  it("supports bare usage for generic decorators whose options are optional", () => {
    const kind = defineClassKind({
      id: "example.optional-worker",
      injectable: true,
      autoDiscover: true,
      analyzeConstructor: true,
      managedMethods: false,
    });
    const OptionalWorker = defineManagedClassDecorator<
      { readonly scope?: string } | undefined,
      { readonly scope: string }
    >({
      id: "example.optional-worker-decorator",
      compilerSymbol: { moduleSpecifier: "test.example", exportName: "OptionalWorker" },
      kind,
      createMetadata: (options) => Object.freeze({ scope: options?.scope ?? "default" }),
    });

    @OptionalWorker
    class BareWorker {}

    @OptionalWorker({ scope: "custom" })
    class ConfiguredWorker {}

    expect(getManagedClassMetadata(BareWorker)?.data).toEqual({ scope: "default" });
    expect(getManagedClassMetadata(ConfiguredWorker)?.data).toEqual({ scope: "custom" });
  });
});
