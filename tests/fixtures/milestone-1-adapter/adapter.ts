import {
  defineClassKind,
  defineManagedClassDecorator,
  getManagedClassMetadata,
  type ManagedClassKind,
} from "@bunwire/core";

const subscriberKind = defineClassKind({
  id: "fixture.subscriber",
  injectable: true,
  autoDiscover: true,
  analyzeConstructor: true,
  managedMethods: true,
  registry: true,
});

export const Subscriber = defineManagedClassDecorator<{ topic: string }, { topic: string }>({
  id: "fixture.subscriber-decorator",
  compilerSymbol: { moduleSpecifier: "fixture.adapter", exportName: "Subscriber" },
  kind: subscriberKind,
  createMetadata: ({ topic }) => ({ topic }),
});

export class UserEvents {}
Subscriber({ topic: "user.created" })(UserEvents);

const kindContract: ManagedClassKind = Subscriber.definition.kind;
const metadata = getManagedClassMetadata(UserEvents);

void kindContract;
void metadata;
