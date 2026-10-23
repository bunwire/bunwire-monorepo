import { BunQueueError } from "./jobs.js";

export interface JobSerializer {
  readonly id: string;
  readonly version: number;
  serialize(arguments_: readonly unknown[]): string;
  deserialize(payload: string): readonly unknown[];
}

// Walk descriptors, not values/getters: serialization must never silently drop data or execute accessors.
function validate(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)
    && (!Number.isInteger(value) || Number.isSafeInteger(value))) return;
  if (typeof value !== "object" || value === null || ancestors.has(value)) throw new BunQueueError("Job payload must contain lossless JSON values without cycles.");
  const array = Array.isArray(value);
  if (array && Object.getPrototypeOf(value) !== Array.prototype) throw new BunQueueError("Job payload cannot contain array subclasses or custom array prototypes.");
  if (!array && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new BunQueueError("Job payload cannot contain class or native object instances.");
  ancestors.add(value);
  try {
    const keys = Reflect.ownKeys(value);
    if (array && keys.length !== value.length + 1) throw new BunQueueError("Job payload arrays must be dense and cannot contain extra properties.");
    for (const key of keys) {
      if (array && key === "length") continue;
      if (typeof key !== "string" || (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length))) throw new BunQueueError("Job payload cannot contain symbol or extra array properties.");
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!("value" in descriptor) || !descriptor.enumerable) throw new BunQueueError("Job payload cannot contain accessors or non-enumerable values.");
      validate(descriptor.value, ancestors);
    }
  } finally { ancestors.delete(value); }
}

export class JsonJobSerializer implements JobSerializer {
  readonly id = "bun.json";
  readonly version = 1;
  serialize(arguments_: readonly unknown[]): string {
    if (!Array.isArray(arguments_)) throw new BunQueueError("Job arguments must be an array tuple.");
    validate(arguments_);
    return JSON.stringify(arguments_);
  }
  deserialize(payload: string): readonly unknown[] {
    let value: unknown;
    try { value = JSON.parse(payload); }
    catch (cause) { throw new BunQueueError("Job payload is not valid JSON.", { cause }); }
    if (!Array.isArray(value)) throw new BunQueueError("Job payload must deserialize to an argument tuple.");
    validate(value);
    return value;
  }
}
