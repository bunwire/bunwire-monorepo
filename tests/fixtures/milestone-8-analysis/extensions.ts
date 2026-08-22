import {
  defineClassKind,
  defineManagedClassDecorator,
  defineManagedMethodDecorator,
  defineMethodKind,
  defineParameterInjector,
  createParameterResolverId,
} from "@bunwire/core";

export const CONSUMER_KIND = defineClassKind({
  id: "fixture.consumer",
  injectable: true,
  autoDiscover: true,
  analyzeConstructor: true,
  managedMethods: true,
  registry: true,
});

export const Consumer = defineManagedClassDecorator<
  string | undefined,
  { readonly name: string | undefined },
  "fixture.consumer.decorator"
>({
  id: "fixture.consumer.decorator",
  kind: CONSUMER_KIND,
  createMetadata: (name) => Object.freeze({ name }),
});

export const SUBSCRIBE_KIND = defineMethodKind({
  id: "fixture.subscribe",
  allowedOn: [CONSUMER_KIND],
  invocable: true,
});

export const Subscribe = defineManagedMethodDecorator<
  string,
  { readonly topic: string },
  "fixture.subscribe.decorator"
>({
  id: "fixture.subscribe.decorator",
  kind: SUBSCRIBE_KIND,
  createMetadata: (topic) => Object.freeze({ topic }),
});

export const FrameworkValue = defineParameterInjector<
  void,
  Readonly<Record<string, never>>,
  "fixture.framework-value.decorator"
>({
  id: "fixture.framework-value.decorator",
  resolverId: createParameterResolverId("fixture.framework-value"),
  createMetadata: () => Object.freeze({}),
});
