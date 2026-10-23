import { Event, EVENT_KIND, getManagedClassMetadata, type EventConstructor } from "@bunwire/core";
import { BunQueueError, queueInteger } from "./jobs.js";

export interface QueueEventCodec<EventType extends object, Payload> {
  readonly id: string;
  readonly version: number;
  readonly event: EventConstructor<EventType>;
  readonly encode: (event: EventType) => Payload;
  readonly decode: (payload: Payload) => EventType;
}
export function validateQueueEventCodec(codec: QueueEventCodec<any, any>): void {
  if (!codec || typeof codec !== "object" || typeof codec.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(codec.id)
    || typeof codec.event !== "function" || typeof codec.encode !== "function" || typeof codec.decode !== "function") throw new BunQueueError("Queue event codecs require stable id, version, canonical event, encode and decode.");
  queueInteger(codec.version, "Event codec version", 1);
  const metadata = getManagedClassMetadata(codec.event);
  if (metadata?.kindId !== EVENT_KIND.id || metadata.decoratorId !== Event.definition.id) throw new BunQueueError("Queue event codec requires a canonical Core @Event class.");
}
export function defineQueueEventCodec<Target extends EventConstructor<any>, Payload>(options: {
  readonly id: string; readonly version: number; readonly event: Target;
  readonly encode: (event: InstanceType<Target>) => Payload;
  readonly decode: (payload: Payload) => InstanceType<Target>;
} & (Payload extends PromiseLike<any> ? never : unknown)): QueueEventCodec<InstanceType<Target>, Payload> {
  validateQueueEventCodec(options);
  return Object.freeze({ id: options.id, version: options.version, event: options.event, encode: options.encode, decode: options.decode });
}
export function snapshotEventCodecs(codecs: readonly QueueEventCodec<any, any>[] = []): readonly QueueEventCodec<any, any>[] {
  if (!Array.isArray(codecs)) throw new BunQueueError("Queue eventCodecs must be an array.");
  const ids = new Set<string>(); const events = new Set<EventConstructor>();
  return Object.freeze(Array.from(codecs, (codec) => {
    validateQueueEventCodec(codec);
    if (ids.has(codec.id) || events.has(codec.event)) throw new BunQueueError("Queue event codecs require unique IDs and one unambiguous codec per event.");
    ids.add(codec.id); events.add(codec.event);
    return Object.freeze({ id: codec.id, version: codec.version, event: codec.event, encode: codec.encode, decode: codec.decode });
  }));
}
export function requireSynchronousCodecResult<Value>(value: Value): Value {
  if (value && (typeof value === "object" || typeof value === "function") && "then" in value && typeof value.then === "function") {
    // Invalid async codecs can reject too; report the contract violation without an unhandled rejection.
    void Promise.resolve(value).catch(() => undefined);
    throw new BunQueueError("Queue event codecs must encode and decode synchronously.");
  }
  return value;
}
