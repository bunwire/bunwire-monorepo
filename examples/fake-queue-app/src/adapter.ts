import {
  Adapter,
  MIDDLEWARE_KIND,
  createParameterResolverId,
  defineAdapterCompilerDescriptor,
  defineClassKind,
  defineManagedClassDecorator,
  defineManagedMethodDecorator,
  defineMethodKind,
  defineParameterInjector,
  defineParameterResolver,
  defineRuntimeRegistryConsumer,
  executeMiddlewareChain,
  type ManagedMethodPlan,
  type AdapterPreparationContext,
  type MiddlewareAttachment,
  type MiddlewareClassMetadata,
  type MiddlewareConstructor,
  type RuntimeRegistry,
  type RuntimeRegistryConsumerContext,
} from "@bunwire/core";

export type FakeQueueTransport = "command" | "event";

export interface FakeQueueHost {
  readonly name: string;
}

export interface FakeQueueMiddlewareContext {
  readonly topic: string;
  readonly transport: FakeQueueTransport;
  readonly host: FakeQueueHost;
  readonly args: readonly unknown[];
  readonly parameters: readonly string[];
}

export interface FakeQueueDelivery {
  readonly topic: string;
  readonly transport: FakeQueueTransport;
  readonly host: FakeQueueHost;
  readonly invocationId: number;
}

export const FAKE_QUEUE_CONSUMER_KIND = defineClassKind({
  id: "fake-queue.consumer",
  injectable: true,
  autoDiscover: true,
  analyzeConstructor: true,
  managedMethods: true,
  registry: true,
});

export const Consumer = defineManagedClassDecorator<void, undefined, "fake-queue.consumer.decorator">({
  id: "fake-queue.consumer.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/fake-queue", exportName: "Consumer" },
  kind: FAKE_QUEUE_CONSUMER_KIND,
  createMetadata: () => undefined,
});

export const FAKE_QUEUE_COMMAND_KIND = defineMethodKind({
  id: "fake-queue.command",
  allowedOn: [FAKE_QUEUE_CONSUMER_KIND],
  invocable: true,
});

export const FAKE_QUEUE_EVENT_KIND = defineMethodKind({
  id: "fake-queue.event",
  allowedOn: [FAKE_QUEUE_CONSUMER_KIND],
  invocable: true,
});

export const Command = defineManagedMethodDecorator<string, { readonly topic: string }, "fake-queue.command.decorator">({
  id: "fake-queue.command.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/fake-queue", exportName: "Command" },
  kind: FAKE_QUEUE_COMMAND_KIND,
  createMetadata: (topic) => Object.freeze({ topic }),
});

export const Event = defineManagedMethodDecorator<string, { readonly topic: string }, "fake-queue.event.decorator">({
  id: "fake-queue.event.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/fake-queue", exportName: "Event" },
  kind: FAKE_QUEUE_EVENT_KIND,
  createMetadata: (topic) => Object.freeze({ topic }),
});

const DELIVERY_RESOLVER = createParameterResolverId("fake-queue.delivery");

export const Delivery = defineParameterInjector<void, undefined, "fake-queue.delivery.decorator">({
  id: "fake-queue.delivery.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/fake-queue", exportName: "Delivery" },
  resolverId: DELIVERY_RESOLVER,
  createMetadata: () => undefined,
});

export const FAKE_QUEUE_COMPILER = defineAdapterCompilerDescriptor({
  id: "fake-queue.adapter",
  classKinds: [FAKE_QUEUE_CONSUMER_KIND],
  classDecorators: [Consumer.definition],
  methodKinds: [FAKE_QUEUE_COMMAND_KIND, FAKE_QUEUE_EVENT_KIND],
  methodDecorators: [Command.definition, Event.definition],
  parameterInjectors: [Delivery.definition],
});

interface QueueState {
  readonly commands: Map<string, (args: readonly unknown[]) => Promise<unknown>>;
  readonly events: Map<string, (args: readonly unknown[]) => Promise<unknown>>;
}

const states = new WeakMap<FakeQueueHost, QueueState>();

function stateFor(host: FakeQueueHost): QueueState {
  const state = states.get(host);
  if (!state) throw new Error("Fake queue host has not started.");
  return state;
}

function topicFor(plan: ManagedMethodPlan): string {
  const topic = (plan.data as { readonly topic?: unknown } | undefined)?.topic;
  if (typeof topic !== "string" || topic.trim().length === 0) {
    throw new TypeError(`Fake queue method ${plan.target.name}.${String(plan.method)} has an invalid topic.`);
  }
  return topic;
}

interface QueueMiddlewareDefinition {
  readonly target: MiddlewareConstructor;
  readonly data: MiddlewareClassMetadata;
}

function definitionsFor(registry: RuntimeRegistry): ReadonlyMap<MiddlewareConstructor, QueueMiddlewareDefinition> {
  const definitions = new Map<MiddlewareConstructor, QueueMiddlewareDefinition>();
  for (const entry of registry.classes) {
    if (entry.kind !== MIDDLEWARE_KIND) continue;
    const target = entry.target as MiddlewareConstructor;
    const data = entry.data as MiddlewareClassMetadata;
    for (const value of [...(data.only ?? []), ...(data.except ?? [])]) {
      if (value !== "command" && value !== "event") {
        throw new TypeError(`Fake queue middleware ${target.name} has unsupported transport ${JSON.stringify(value)}.`);
      }
    }
    definitions.set(target, Object.freeze({ target, data }));
  }
  for (const plan of registry.methods) {
    if (plan.kind !== FAKE_QUEUE_COMMAND_KIND && plan.kind !== FAKE_QUEUE_EVENT_KIND) continue;
    for (const attachment of plan.middleware) {
      if (!definitions.has(attachment.target)) {
        throw new TypeError(`Fake queue method attaches undefined middleware ${attachment.target.name}.`);
      }
    }
  }
  return definitions;
}

function applies(data: MiddlewareClassMetadata, topic: string, transport: FakeQueueTransport): boolean {
  if (data.include && !data.include.includes(topic)) return false;
  if (data.exclude?.includes(topic)) return false;
  if (data.only && !data.only.includes(transport)) return false;
  if (data.except?.includes(transport)) return false;
  return true;
}

function middlewareContext(
  host: FakeQueueHost,
  topic: string,
  transport: FakeQueueTransport,
  args: readonly unknown[],
  attachment: MiddlewareAttachment,
): FakeQueueMiddlewareContext {
  return Object.freeze({
    topic,
    transport,
    host,
    args: Object.freeze([...args]),
    parameters: attachment.parameters,
  });
}

const deliveryResolver = defineParameterResolver({
  id: DELIVERY_RESOLVER,
  resolve: ({ context, plan }) => Object.freeze({
    topic: topicFor(plan),
    transport: plan.kind === FAKE_QUEUE_COMMAND_KIND ? "command" as const : "event" as const,
    host: context.applicationContext as FakeQueueHost,
    invocationId: context.id,
  }),
});

function invoke(
  consumer: RuntimeRegistryConsumerContext<FakeQueueHost>,
  plan: ManagedMethodPlan,
  definitions: ReadonlyMap<MiddlewareConstructor, QueueMiddlewareDefinition>,
  topic: string,
  transport: FakeQueueTransport,
  args: readonly unknown[],
): Promise<unknown> {
  const attachments = Object.freeze(plan.middleware.filter((attachment) => {
    const definition = definitions.get(attachment.target)!;
    return applies(definition.data, topic, transport);
  }));
  return consumer.invoke(plan, args, {
    around: (invocation, next) => executeMiddlewareChain({
      invocation,
      attachments,
      createContext: (attachment) => middlewareContext(
        consumer.applicationContext,
        topic,
        transport,
        args,
        attachment,
      ),
      terminal: next,
    }),
  });
}

const registryConsumer = defineRuntimeRegistryConsumer<"fake-queue.registry", FakeQueueHost>({
  id: "fake-queue.registry",
  consume: (registry, consumer) => {
    const definitions = definitionsFor(registry);
    const state = stateFor(consumer.applicationContext);
    for (const plan of registry.methods) {
      const transport = plan.kind === FAKE_QUEUE_COMMAND_KIND
        ? "command"
        : plan.kind === FAKE_QUEUE_EVENT_KIND ? "event" : undefined;
      if (!transport) continue;
      const topic = topicFor(plan);
      const handlers = transport === "command" ? state.commands : state.events;
      if (handlers.has(topic)) throw new TypeError(`Duplicate fake queue topic ${topic}.`);
      handlers.set(topic, (args) => invoke(consumer, plan, definitions, topic, transport, args));
    }
  },
});

export class FakeQueueAdapter extends Adapter<FakeQueueHost> {
  static readonly compiler = FAKE_QUEUE_COMPILER;

  constructor() {
    super({ parameterResolvers: [deliveryResolver], registryConsumers: [registryConsumer] });
  }

  protected override prepareHost(context: AdapterPreparationContext): FakeQueueHost {
    if (!context.hasManualContext || typeof (context.manualContext as Partial<FakeQueueHost> | undefined)?.name !== "string") {
      throw new TypeError("FakeQueueAdapter requires a manual FakeQueueHost context.");
    }
    const host = context.manualContext as FakeQueueHost;
    states.set(host, { commands: new Map(), events: new Map() });
    return host;
  }

  command(host: FakeQueueHost, topic: string, ...args: readonly unknown[]): Promise<unknown> {
    const handler = stateFor(host).commands.get(topic);
    if (!handler) throw new Error(`No fake queue command ${topic}.`);
    return handler(args);
  }

  async event(host: FakeQueueHost, topic: string, ...args: readonly unknown[]): Promise<void> {
    const handler = stateFor(host).events.get(topic);
    if (!handler) throw new Error(`No fake queue event ${topic}.`);
    await handler(args);
  }
}
