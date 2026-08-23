import type { Application } from "../application/application.js";
import type { ManagedInvocationOptions } from "../application/invocation-context.js";
import type { Container } from "../container/container.js";
import type { Constructable } from "../container/tokens.js";
import type { ConstructorDependencyMetadata } from "../container/metadata.js";
import type { ManagedClassKind } from "../managed-classes/class-kind.js";
import { MIDDLEWARE_KIND } from "../managed-classes/built-ins.js";
import type { ManagedMethodPlan } from "../managed-methods/plan.js";
import {
  createRegistryConsumerId,
  type RegistryConsumerId,
} from "./identifiers.js";
import type { NamespacedIdentifier } from "../managed-classes/identifiers.js";

export interface ManagedClassRegistryEntry<Data = unknown> {
  readonly kind: ManagedClassKind;
  readonly target: Constructable<object>;
  readonly data: Data;
  readonly scope: "singleton" | "transient";
  readonly dependencies: readonly ConstructorDependencyMetadata[];
}

export interface RuntimeRegistry {
  readonly classes: readonly ManagedClassRegistryEntry[];
  readonly providers: readonly Constructable<object>[];
  readonly methods: readonly ManagedMethodPlan[];
}

export type ManagedClassRegistryEntryInput<Data = unknown> = Omit<
  ManagedClassRegistryEntry<Data>,
  "scope" | "dependencies"
> & {
  readonly scope?: ManagedClassRegistryEntry["scope"];
  readonly dependencies?: readonly ConstructorDependencyMetadata[];
};

export interface DefineRuntimeRegistryOptions {
  readonly classes?: readonly ManagedClassRegistryEntryInput[];
  readonly providers?: readonly Constructable<object>[];
  readonly methods?: readonly ManagedMethodPlan[];
}

export function defineRuntimeRegistry(options: DefineRuntimeRegistryOptions = {}): RuntimeRegistry {
  return Object.freeze({
    classes: Object.freeze((options.classes ?? []).map((entry) => Object.freeze({
      ...entry,
      scope: entry.scope ?? (entry.kind === MIDDLEWARE_KIND ? "transient" : "singleton"),
      dependencies: Object.freeze((entry.dependencies ?? []).map((dependency) => Object.freeze({ ...dependency }))),
    }))),
    providers: Object.freeze([...(options.providers ?? [])]),
    methods: Object.freeze([...(options.methods ?? [])]),
  });
}

export interface RuntimeRegistryConsumerContext<Context = unknown> {
  readonly application: Application<Context>;
  readonly applicationContext: Context;
  readonly rootContainer: Container;
  readonly invoke: <Result = unknown>(
    plan: ManagedMethodPlan,
    callerArguments?: readonly unknown[],
    options?: ManagedInvocationOptions<Context, Result>,
  ) => Promise<Awaited<Result>>;
}

export interface RuntimeRegistryConsumerDefinition<
  Id extends string = string,
  Context = unknown,
> {
  readonly id: RegistryConsumerId<Id>;
  readonly consume: (
    registry: RuntimeRegistry,
    context: RuntimeRegistryConsumerContext<Context>,
  ) => void | Promise<void>;
}

export interface DefineRuntimeRegistryConsumerOptions<
  Id extends NamespacedIdentifier,
  Context,
> {
  readonly id: Id;
  readonly consume: RuntimeRegistryConsumerDefinition<Id, Context>["consume"];
}

export function defineRuntimeRegistryConsumer<
  const Id extends NamespacedIdentifier,
  Context = unknown,
>(
  options: DefineRuntimeRegistryConsumerOptions<Id, Context>,
): RuntimeRegistryConsumerDefinition<Id, Context> {
  if (typeof options.consume !== "function") {
    throw new TypeError(`Runtime registry consumer "${options.id}" must be callable.`);
  }
  return Object.freeze({
    id: createRegistryConsumerId(options.id),
    consume: options.consume,
  });
}
