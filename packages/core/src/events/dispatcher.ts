import { getManagedClassMetadata } from "../managed-classes/metadata.js";
import {
  EVENT_KIND,
  Event,
  type EventDefinition,
  type EventConstructor,
  type ListenerDefinition,
} from "./definitions.js";
import { EventDispatchError } from "./errors.js";

export abstract class EventDispatcher {
  abstract dispatch(event: object): Promise<void>;
}

export type EventListenerInvoker = (
  listeners: readonly ListenerDefinition[],
  event: object,
) => Promise<void>;

class DefaultEventDispatcher extends EventDispatcher {
  readonly #events = new Map<EventConstructor, EventDefinition>();
  readonly #invoke: EventListenerInvoker;

  constructor(events: readonly EventDefinition[], invoke: EventListenerInvoker) {
    super();
    for (const event of events) {
      this.#events.set(event.target, event);
    }
    this.#invoke = invoke;
  }

  override async dispatch(event: object): Promise<void> {
    if (typeof event !== "object" || event === null) {
      throw new EventDispatchError("EventDispatcher.dispatch() requires an event object.");
    }
    const prototype = Object.getPrototypeOf(event) as { readonly constructor?: unknown } | null;
    const constructor = prototype?.constructor;
    if (typeof constructor !== "function") {
      throw new EventDispatchError("Dispatched event has no canonical runtime constructor identity.");
    }
    const metadata = getManagedClassMetadata(constructor as EventConstructor);
    if (metadata?.kindId !== EVENT_KIND.id || metadata.decoratorId !== Event.definition.id) {
      throw new EventDispatchError(
        `Dispatched value constructor "${constructor.name || "<anonymous>"}" does not have own metadata from the canonical @Event() decorator.`,
      );
    }
    const definition = this.#events.get(constructor as EventConstructor);
    if (!definition) {
      throw new EventDispatchError(
        `Canonical event "${constructor.name || "<anonymous>"}" is not registered in the generated runtime registry.`,
      );
    }
    await this.#invoke(definition.listeners, event);
  }
}

export function createDefaultEventDispatcher(
  events: readonly EventDefinition[],
  invoke: EventListenerInvoker,
): EventDispatcher {
  return new DefaultEventDispatcher(events, invoke);
}

