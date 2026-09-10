import { describe, expect, it } from "vitest";
import { Adapter, Event, Listener, Provider, EventDispatcher, defineApp, defineAdapterCompilerDescriptor, defineRuntimeRegistry,
  defineEventDefinition, defineListenerDefinition, type EventListenerDeliveryInterceptor, type Container } from "@bunwire/core";

class DeliveryAdapter extends Adapter {
  static readonly compiler = defineAdapterCompilerDescriptor({ id: "proof.delivery" });
  constructor(eventListenerDelivery?: EventListenerDeliveryInterceptor) { super(eventListenerDelivery === undefined ? {} : { eventListenerDelivery }); }
  protected override prepareHost(): object { return {}; }
}
@Event() class Payload { constructor(public value: string) {} }
function registry(targets: readonly (new () => { handle(event: Payload): unknown })[]) {
  const listeners = targets.map((target) => defineListenerDefinition({ target, event: Payload }));
  const event = defineEventDefinition({ target: Payload, listeners });
  return defineRuntimeRegistry({ classes: [event, ...listeners], methods: listeners.map((listener) => listener.handle), events: [event] });
}
describe("generic adapter listener delivery", () => {
  it("preserves exact identities, order, one invocation/Provider boot and direct singleton behavior", async () => {
    const order: string[] = []; const contexts: unknown[] = []; let boots = 0;
    @Provider() class Boot { register(): void {} boot(): void { boots++; } }
    @Listener(Payload) class First { count = 0; handle(event: Payload): void { this.count++; order.push("direct"); event.value = "changed"; } }
    @Listener(Payload) class Deferred { handle(): never { throw new Error("must be intercepted"); } }
    @Listener(Payload) class Last { handle(event: Payload): void { order.push(event.value); } }
    const generated = registry([First, Deferred, Last]); const payload = new Payload("original");
    const app = defineApp().withAdapter(new DeliveryAdapter(async (context, next) => {
      expect(context.event).toBe(payload); expect(generated.classes).toContain(context.listener); expect(Object.isFrozen(context)).toBe(true);
      contexts.push(context.invocation); if (context.listener.target === Deferred) order.push(`deferred:${payload.value}`); else await next();
    })).withProviders(Boot).withRuntimeRegistry(generated);
    await app.start();
    try {
      await app.rootContainer.get(EventDispatcher).dispatch(payload);
      expect(order).toEqual(["direct", "deferred:changed", "changed"]); expect(new Set(contexts).size).toBe(1); expect(boots).toBe(1);
      expect(app.rootContainer.get(First).count).toBe(1);
      await expect(app.rootContainer.get(EventDispatcher).dispatch({ value: "fake" })).rejects.toThrow(/canonical/); expect(boots).toBe(1);
    } finally { await app.stop(); }
  });
  it("fails fast on delivery errors without invoking later listeners", async () => {
    const error = new Error("submission"); let called = false;
    @Listener(Payload) class First { handle(): void {} }
    @Listener(Payload) class Later { handle(): void { called = true; } }
    const app = defineApp().withAdapter(new DeliveryAdapter(() => { throw error; })).withRuntimeRegistry(registry([First, Later])); await app.start();
    try { await expect(app.rootContainer.get(EventDispatcher).dispatch(new Payload("x"))).rejects.toBe(error); expect(called).toBe(false); }
    finally { await app.stop(); }
  });
  it("guards repeat/late continuations and awaits direct delivery started without await", async () => {
    let finish!: () => void; const gate = new Promise<void>((resolve) => { finish = resolve; }); let entered = false;
    @Listener(Payload) class Wait { async handle(): Promise<void> { entered = true; await gate; } }
    let retained!: () => Promise<void>;
    const app = defineApp().withAdapter(new DeliveryAdapter((_context, next) => { retained = next; void next(); })).withRuntimeRegistry(registry([Wait])); await app.start();
    try {
      let settled = false; const pending = app.rootContainer.get(EventDispatcher).dispatch(new Payload("x")).then(() => { settled = true; });
      await Promise.resolve(); await Promise.resolve(); expect(entered).toBe(true); expect(settled).toBe(false);
      await expect(retained()).rejects.toThrow(/only be called once/); finish(); await pending; await expect(retained()).rejects.toThrow(/only be called once/);
    } finally { finish(); await app.stop(); }
  });
  it("preserves distinct interceptor and direct-handler failures", async () => {
    const direct = new Error("direct"); const interception = new Error("interceptor");
    @Listener(Payload) class Failed { handle(): never { throw direct; } }
    const app = defineApp().withAdapter(new DeliveryAdapter((_context, next) => { void next(); throw interception; })).withRuntimeRegistry(registry([Failed])); await app.start();
    try { await expect(app.rootContainer.get(EventDispatcher).dispatch(new Payload("x"))).rejects.toMatchObject({ errors: [interception, direct] }); }
    finally { await app.stop(); }
  });
  it("does not intercept explicit dispatcher replacement and validates its callable contract", async () => {
    expect(() => new DeliveryAdapter(1 as never)).toThrow(/callable/); let count = 0;
    class Replacement extends EventDispatcher { async dispatch(): Promise<void> { count++; } }
    @Provider() class Bind { register(container: Container): void { container.instance(EventDispatcher, new Replacement()); } }
    const app = defineApp().withAdapter(new DeliveryAdapter(() => { throw new Error("replacement must bypass hook"); })).withProviders(Bind).withRuntimeRegistry(defineRuntimeRegistry()); await app.start();
    try { await app.rootContainer.get(EventDispatcher).dispatch({ arbitrary: true }); expect(count).toBe(1); } finally { await app.stop(); }
  });
});
