import { Event } from "@bunwire/core";
import { defineQueueEventCodec, type QueueEventCodec } from "@bunwire/bun";
import { expectTypeOf, it } from "vitest";
@Event() class Payload { readonly #id: string; constructor(id: string) { this.#id = id; } get id(): string { return this.#id; } }
const codec = defineQueueEventCodec({ id: "typed.payload", version: 1, event: Payload, encode: (event) => ({ id: event.id }), decode: (data) => new Payload(data.id) });
it("preserves event and inferred encoded-payload types", () => {
  expectTypeOf(codec).toEqualTypeOf<QueueEventCodec<Payload, { id: string }>>();
  expectTypeOf(codec.encode).parameter(0).toEqualTypeOf<Payload>();
  expectTypeOf(codec.decode).parameter(0).toEqualTypeOf<{ id: string }>();
});
if (false) {
  // @ts-expect-error Async payload encoders are not synchronous event codecs.
  defineQueueEventCodec<typeof Payload, Promise<{ id: string }>>({ id: "async", version: 1, event: Payload, encode: async () => ({ id: "x" }), decode: () => new Payload("x") });
  defineQueueEventCodec<typeof Payload, { id: string }>({ id: "wrong", version: 1, event: Payload, encode: () => ({ id: "x" }),
    // @ts-expect-error Reconstruct the canonical event, including its private state.
    decode: (data) => ({ id: data.id }),
  });
}
