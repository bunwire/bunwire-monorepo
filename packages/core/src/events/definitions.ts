import type { ConstructorDependencyMetadata } from "../container/metadata.js";
import { normalizeConstructorMetadata } from "../container/metadata.js";
import type { Constructable } from "../container/tokens.js";
import type { ManagedClassRegistryEntry } from "../adapters/runtime-registry.js";
import { defineManagedClassDecorator } from "../managed-classes/class-decorator.js";
import { defineClassKind } from "../managed-classes/class-kind.js";
import { getManagedClassMetadata, type ManagedClassTarget } from "../managed-classes/metadata.js";
import { defineManagedMethodDecorator } from "../managed-methods/method-decorator.js";
import { defineMethodKind } from "../managed-methods/method-kind.js";
import { defineManagedMethodPlan, type ManagedMethodPlan } from "../managed-methods/plan.js";
import { EventDefinitionError } from "./errors.js";

export type EventConstructor<Event extends object = object> = new (...args: any[]) => Event;

export interface EventClassMetadata {
  readonly type: "event";
}

export interface EventListener<Event extends object = object> {
  handle(event: Event): unknown;
}

export type ListenerConstructor<
  Event extends object = object,
  Listener extends EventListener<Event> = EventListener<Event>,
> = Constructable<Listener>;

export interface ListenerClassMetadata<Event extends object = object> {
  readonly type: "listener";
  readonly event: EventConstructor<Event>;
}

export const EVENT_KIND = defineClassKind({
  id: "core.event",
  injectable: false,
  autoDiscover: true,
  analyzeConstructor: false,
  managedMethods: false,
  registry: true,
});

export const LISTENER_KIND = defineClassKind({
  id: "core.listener",
  injectable: true,
  autoDiscover: true,
  analyzeConstructor: true,
  managedMethods: true,
  registry: true,
});

const LISTENER_HANDLE_KIND = defineMethodKind({
  id: "core.listener.handle",
  allowedOn: [LISTENER_KIND],
  invocable: true,
});

const ListenerHandle = defineManagedMethodDecorator<
  void,
  Readonly<{ type: "event-listener-handle" }>,
  "core.listener.handle.decorator"
>({
  id: "core.listener.handle.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/core", exportName: "Listener" },
  kind: LISTENER_HANDLE_KIND,
  createMetadata: () => Object.freeze({ type: "event-listener-handle" as const }),
});

function className(target: unknown): string {
  return typeof target === "function" && target.name ? target.name : "<anonymous>";
}

export function assertEventTarget(target: unknown): asserts target is EventConstructor {
  if (typeof target !== "function") {
    throw new EventDefinitionError("Event target must be a constructable class.");
  }
  const metadata = getManagedClassMetadata(target as ManagedClassTarget);
  if (metadata?.kindId !== EVENT_KIND.id || metadata.decoratorId !== Event.definition.id) {
    throw new EventDefinitionError(
      `Event target "${className(target)}" must have own metadata from the canonical @Event() decorator.`,
    );
  }
}

function findHandleDescriptor(target: ManagedClassTarget): PropertyDescriptor | undefined {
  let prototype: object | null = target.prototype;
  while (prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "handle");
    if (descriptor) return descriptor;
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  return undefined;
}

export function assertListenerTarget(target: unknown): asserts target is ListenerConstructor {
  if (typeof target !== "function") {
    throw new EventDefinitionError("Listener target must be a constructable class.");
  }
  const metadata = getManagedClassMetadata(target as ManagedClassTarget);
  if (metadata?.kindId !== LISTENER_KIND.id || metadata.decoratorId !== Listener.definition.id) {
    throw new EventDefinitionError(
      `Listener target "${className(target)}" must have own metadata from the canonical @Listener() decorator.`,
    );
  }
  const descriptor = findHandleDescriptor(target as ManagedClassTarget);
  if (typeof descriptor?.value !== "function") {
    throw new EventDefinitionError(
      `Listener target "${className(target)}" must provide a callable instance handle(event) method.`,
    );
  }
}

export const Event = defineManagedClassDecorator<
  void,
  EventClassMetadata,
  "core.event.decorator"
>({
  id: "core.event.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/core", exportName: "Event" },
  kind: EVENT_KIND,
  createMetadata: () => Object.freeze({ type: "event" as const }),
});

export const Listener = defineManagedClassDecorator<
  EventConstructor,
  ListenerClassMetadata,
  "core.listener.decorator"
>({
  id: "core.listener.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/core", exportName: "Listener" },
  kind: LISTENER_KIND,
  bare: false,
  createMetadata: (event) => {
    assertEventTarget(event);
    return Object.freeze({ type: "listener" as const, event });
  },
  validateTarget: (target) => {
    const descriptor = findHandleDescriptor(target);
    if (typeof descriptor?.value !== "function") {
      throw new EventDefinitionError(
        `Listener target "${className(target)}" must provide a callable instance handle(event) method.`,
      );
    }
    (ListenerHandle as MethodDecorator)(target.prototype, "handle", descriptor);
  },
});

export interface ListenerDefinition<
  Event extends object = object,
  Target extends ListenerConstructor<Event> = ListenerConstructor<Event>,
> extends ManagedClassRegistryEntry<ListenerClassMetadata<Event>> {
  readonly kind: typeof LISTENER_KIND;
  readonly target: Target;
  readonly event: EventConstructor<Event>;
  readonly handle: ManagedMethodPlan<Target, Readonly<{ type: "event-listener-handle" }>>;
}

export interface DefineListenerDefinitionOptions<
  Event extends object,
  Target extends ListenerConstructor<Event>,
> {
  readonly target: Target;
  readonly event: EventConstructor<Event>;
  readonly dependencies?: readonly ConstructorDependencyMetadata[];
}

export interface EventDefinition<
  Event extends object = object,
  Target extends EventConstructor<Event> = EventConstructor<Event>,
> extends ManagedClassRegistryEntry<EventClassMetadata> {
  readonly kind: typeof EVENT_KIND;
  readonly target: Target;
  readonly alias?: string;
  readonly listeners: readonly ListenerDefinition<Event>[];
}

export interface DefineEventDefinitionOptions<
  Event extends object,
  Target extends EventConstructor<Event>,
> {
  readonly target: Target;
  readonly alias?: string;
  readonly listeners?: readonly ListenerDefinition<Event>[];
}

export interface EventAliasDefinition {
  readonly alias: string;
  readonly event: EventDefinition;
}

export function defineListenerDefinition<
  Event extends object,
  Target extends ListenerConstructor<Event>,
>(options: DefineListenerDefinitionOptions<Event, Target>): ListenerDefinition<Event, Target> {
  assertEventTarget(options.event);
  assertListenerTarget(options.target);
  const metadata = getManagedClassMetadata(options.target) as { readonly data?: ListenerClassMetadata } | undefined;
  if (metadata?.data?.event !== options.event) {
    throw new EventDefinitionError(
      `Listener "${options.target.name}" registry event must match its canonical @Listener() target.`,
    );
  }
  const dependencies = normalizeConstructorMetadata({
    target: options.target,
    dependencies: options.dependencies ?? [],
  }).dependencies;
  const handle = defineManagedMethodPlan({
    kind: LISTENER_HANDLE_KIND,
    ownerKind: LISTENER_KIND,
    target: options.target,
    method: "handle" as keyof InstanceType<Target> & PropertyKey,
    data: Object.freeze({ type: "event-listener-handle" as const }),
    parameters: [
      { source: "transport", methodIndex: 0, argumentIndex: 0, optional: false },
    ],
  });
  return Object.freeze({
    kind: LISTENER_KIND,
    target: options.target,
    data: Object.freeze({ type: "listener" as const, event: options.event }),
    scope: "singleton" as const,
    dependencies,
    event: options.event,
    handle,
  });
}

export function defineEventDefinition<
  Event extends object,
  Target extends EventConstructor<Event>,
>(options: DefineEventDefinitionOptions<Event, Target>): EventDefinition<Event, Target> {
  assertEventTarget(options.target);
  if (options.alias !== undefined
    && (typeof options.alias !== "string" || options.alias.trim().length === 0)) {
    throw new EventDefinitionError("Event alias must be a non-empty string when present.");
  }
  const listeners = Object.freeze([...(options.listeners ?? [])]);
  const targets = new Set<Function>();
  for (const listener of listeners) {
    validateListenerDefinition(listener);
    if (listener.event !== options.target) {
      throw new EventDefinitionError(
        `Listener "${listener.target.name}" targets a different event than "${options.target.name}".`,
      );
    }
    if (targets.has(listener.target)) {
      throw new EventDefinitionError(
        `Event "${options.target.name}" contains duplicate listener "${listener.target.name}".`,
      );
    }
    targets.add(listener.target);
  }
  return Object.freeze({
    kind: EVENT_KIND,
    target: options.target,
    data: Object.freeze({ type: "event" as const }),
    scope: "singleton" as const,
    dependencies: Object.freeze([]),
    ...(options.alias === undefined ? {} : { alias: options.alias }),
    listeners,
  });
}

export function defineEventAlias(
  alias: string,
  event: EventDefinition,
): EventAliasDefinition {
  if (typeof alias !== "string" || alias.trim().length === 0) {
    throw new EventDefinitionError("Event alias must be a non-empty string.");
  }
  validateEventDefinition(event);
  if (event.alias !== alias) {
    throw new EventDefinitionError(
      `Event alias entry "${alias}" must match the canonical event definition alias.`,
    );
  }
  return Object.freeze({ alias, event });
}

export function validateListenerDefinition(
  definition: unknown,
): asserts definition is ListenerDefinition {
  if (!definition || typeof definition !== "object" || !Object.isFrozen(definition)) {
    throw new EventDefinitionError("Listener definition must be an immutable object.");
  }
  const candidate = definition as Partial<ListenerDefinition>;
  if (candidate.kind !== LISTENER_KIND || candidate.scope !== "singleton") {
    throw new EventDefinitionError("Listener definition must use the canonical listener kind and singleton scope.");
  }
  assertListenerTarget(candidate.target);
  assertEventTarget(candidate.event);
  const metadata = getManagedClassMetadata(candidate.target) as { readonly data?: ListenerClassMetadata } | undefined;
  if (metadata?.data?.event !== candidate.event) {
    throw new EventDefinitionError(
      `Listener "${candidate.target.name}" definition does not match its canonical event target.`,
    );
  }
  if (!Array.isArray(candidate.dependencies) || !Object.isFrozen(candidate.dependencies)) {
    throw new EventDefinitionError("Listener constructor dependencies must be immutable.");
  }
  normalizeConstructorMetadata({
    target: candidate.target,
    dependencies: candidate.dependencies,
  });
  const handle = candidate.handle;
  if (!handle || handle.kind !== LISTENER_HANDLE_KIND || handle.ownerKind !== LISTENER_KIND
    || handle.target !== candidate.target || handle.method !== "handle"
    || handle.parameters.length !== 1
    || handle.parameters[0]?.source !== "transport"
    || handle.parameters[0].methodIndex !== 0
    || handle.parameters[0].argumentIndex !== 0
    || handle.parameters[0].optional !== false
    || handle.middleware.length !== 0) {
    throw new EventDefinitionError(
      `Listener "${candidate.target.name}" must contain its canonical managed handle(event) plan.`,
    );
  }
}

export function validateEventDefinition(
  definition: unknown,
): asserts definition is EventDefinition {
  if (!definition || typeof definition !== "object" || !Object.isFrozen(definition)) {
    throw new EventDefinitionError("Event definition must be an immutable object.");
  }
  const candidate = definition as Partial<EventDefinition>;
  if (candidate.kind !== EVENT_KIND || candidate.scope !== "singleton") {
    throw new EventDefinitionError("Event definition must use the canonical event kind and singleton registry scope.");
  }
  assertEventTarget(candidate.target);
  if (candidate.alias !== undefined
    && (typeof candidate.alias !== "string" || candidate.alias.trim().length === 0)) {
    throw new EventDefinitionError("Event alias must be a non-empty string when present.");
  }
  if (!Array.isArray(candidate.dependencies) || candidate.dependencies.length !== 0
    || !Object.isFrozen(candidate.dependencies)) {
    throw new EventDefinitionError("Event definitions cannot contain constructor dependencies.");
  }
  if (!Array.isArray(candidate.listeners) || !Object.isFrozen(candidate.listeners)) {
    throw new EventDefinitionError("Event listeners must be an immutable array.");
  }
  const targets = new Set<Function>();
  for (const listener of candidate.listeners) {
    validateListenerDefinition(listener);
    if (listener.event !== candidate.target) {
      throw new EventDefinitionError(
        `Listener "${listener.target.name}" does not target event "${candidate.target.name}".`,
      );
    }
    if (targets.has(listener.target)) {
      throw new EventDefinitionError(
        `Event "${candidate.target.name}" contains duplicate listener "${listener.target.name}".`,
      );
    }
    targets.add(listener.target);
  }
}

export function isListenerHandlePlan(plan: ManagedMethodPlan): boolean {
  return plan.kind === LISTENER_HANDLE_KIND;
}

export function listenerHandleKind() {
  return LISTENER_HANDLE_KIND;
}
