import {
  EVENT_KIND,
  Event,
  EventDefinitionError,
  EventDispatcher,
  EventDispatchError,
  Listener,
  Provider,
  SERVICE_KIND,
  Service,
  defineApp,
  defineEventAlias,
  defineEventDefinition,
  defineListenerDefinition,
  defineRuntimeRegistry,
  type EventDefinition,
  type ListenerDefinition,
  type ManagedClassRegistryEntry,
  type ProviderLifecycle,
  type RuntimeRegistry,
} from "@bunwire/core";
import { describe, expect, it } from "vitest";

function runtimeRegistry(
  events: readonly EventDefinition[],
  classes: readonly ManagedClassRegistryEntry[] = [],
  providers: readonly (new () => ProviderLifecycle)[] = [],
): RuntimeRegistry {
  const listeners = events.flatMap((event) => event.listeners);
  return defineRuntimeRegistry({
    classes: [...classes, ...events, ...listeners],
    providers,
    methods: listeners.map((listener) => listener.handle),
    events,
    eventAliases: events.flatMap((event) => (
      event.alias === undefined ? [] : [defineEventAlias(event.alias, event)]
    )),
  });
}

function serviceEntry<Target extends new (...args: any[]) => object>(
  target: Target,
  dependencies: ManagedClassRegistryEntry["dependencies"] = [],
): ManagedClassRegistryEntry {
  return Object.freeze({
    kind: SERVICE_KIND,
    target,
    data: Object.freeze({ scope: "singleton" as const }),
    scope: "singleton" as const,
    dependencies: Object.freeze([...dependencies]),
  });
}

describe("Milestone 14 — Core event definitions", () => {
  it("keeps events as ordinary payload objects and aliases as secondary registry metadata", () => {
    @Event()
    class PayloadEvent {
      constructor(readonly id: string, readonly count: number) {}
    }
    const definition = defineEventDefinition({ target: PayloadEvent, alias: "payload.created" });
    const value = new PayloadEvent("one", 2);

    expect(value).toEqual({ id: "one", count: 2 });
    expect("handle" in value).toBe(false);
    expect(EVENT_KIND.injectable).toBe(false);
    expect(definition.alias).toBe("payload.created");
    expect(defineEventAlias("payload.created", definition).event).toBe(definition);
    expect(() => defineEventAlias("different", definition)).toThrow(EventDefinitionError);
  });

  it("rejects noncanonical targets and mismatched listener relationships", () => {
    class PlainEvent {}
    expect(() => defineEventDefinition({ target: PlainEvent })).toThrow(/canonical @Event/i);

    @Event()
    class FirstEvent {}
    @Event()
    class SecondEvent {}
    @Listener(FirstEvent)
    class FirstListener {
      handle(_event: FirstEvent): void {}
    }
    const listener = defineListenerDefinition({ target: FirstListener, event: FirstEvent });
    expect(() => defineEventDefinition({ target: SecondEvent, listeners: [listener as ListenerDefinition<SecondEvent>] }))
      .toThrow(/different event/i);
  });
});

describe("Milestone 14 — EventDispatcher behavior", () => {
  it("rejects duplicate alias indexes and cloned event registry identities at startup", async () => {
    @Event()
    class IndexedEvent {}
    const event = defineEventDefinition({ target: IndexedEvent, alias: "indexed.event" });
    const alias = defineEventAlias("indexed.event", event);
    const duplicateAliases = defineRuntimeRegistry({
      classes: [event],
      events: [event],
      eventAliases: [alias, alias],
    });
    await expect(defineApp().withRuntimeRegistry(duplicateAliases).start())
      .rejects.toThrow(/duplicate event alias/i);

    const clonedIdentity = defineRuntimeRegistry({
      classes: [{ ...event }],
      events: [event],
      eventAliases: [alias],
    });
    await expect(defineApp().withRuntimeRegistry(clonedIdentity).start())
      .rejects.toThrow(/same canonical object/i);
  });

  it("dispatches one listener through constructor DI with the exact event instance", async () => {
    @Service()
    class AuditService {
      received: object | undefined;
    }
    @Event()
    class Registered {
      constructor(readonly id: string) {}
    }
    @Listener(Registered)
    class AuditListener {
      constructor(private readonly audit: AuditService) {}
      handle(event: Registered): void {
        this.audit.received = event;
      }
    }
    const listener = defineListenerDefinition({
      target: AuditListener,
      event: Registered,
      dependencies: [{ index: 0, token: AuditService }],
    });
    const eventDefinition = defineEventDefinition({ target: Registered, listeners: [listener] });
    const app = defineApp().withRuntimeRegistry(runtimeRegistry(
      [eventDefinition],
      [serviceEntry(AuditService)],
    ));
    await app.start();
    const event = new Registered("123");
    await app.rootContainer.get(EventDispatcher).dispatch(event);
    expect(app.rootContainer.get(AuditService).received).toBe(event);
    expect(app.rootContainer.get(AuditListener)).toBeInstanceOf(AuditListener);
  });

  it("awaits listeners sequentially in registry order", async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    @Event()
    class OrderedEvent {}
    @Listener(OrderedEvent)
    class FirstListener {
      async handle(_event: OrderedEvent): Promise<void> {
        order.push("first:start");
        await gate;
        order.push("first:end");
      }
    }
    @Listener(OrderedEvent)
    class SecondListener {
      handle(_event: OrderedEvent): void {
        order.push("second");
      }
    }
    const first = defineListenerDefinition({ target: FirstListener, event: OrderedEvent });
    const second = defineListenerDefinition({ target: SecondListener, event: OrderedEvent });
    const event = defineEventDefinition({ target: OrderedEvent, listeners: [first, second] });
    const app = defineApp().withRuntimeRegistry(runtimeRegistry([event]));
    await app.start();

    const dispatched = app.rootContainer.get(EventDispatcher).dispatch(new OrderedEvent());
    await Promise.resolve();
    expect(order).toEqual(["first:start"]);
    release();
    await dispatched;
    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("propagates the original failure and skips remaining listeners", async () => {
    const error = new Error("listener failed");
    const order: string[] = [];
    @Event()
    class FailedEvent {}
    @Listener(FailedEvent)
    class SuccessListener {
      handle(_event: FailedEvent): void { order.push("success"); }
    }
    @Listener(FailedEvent)
    class FailingListener {
      handle(_event: FailedEvent): never { order.push("failure"); throw error; }
    }
    @Listener(FailedEvent)
    class SkippedListener {
      handle(_event: FailedEvent): void { order.push("skipped"); }
    }
    const listeners = [SuccessListener, FailingListener, SkippedListener].map((target) => (
      defineListenerDefinition({ target, event: FailedEvent })
    ));
    const event = defineEventDefinition({ target: FailedEvent, listeners });
    const app = defineApp().withRuntimeRegistry(runtimeRegistry([event]));
    await app.start();
    await expect(app.rootContainer.get(EventDispatcher).dispatch(new FailedEvent())).rejects.toBe(error);
    expect(order).toEqual(["success", "failure"]);
  });

  it("accepts registered events with no listeners and rejects unknown or undecorated identities", async () => {
    @Event()
    class EmptyEvent {}
    class UndecoratedChild extends EmptyEvent {}
    @Event()
    class DecoratedChild extends EmptyEvent {}
    class PlainEvent {}
    const empty = defineEventDefinition({ target: EmptyEvent, alias: "empty" });
    const child = defineEventDefinition({ target: DecoratedChild });
    const app = defineApp().withRuntimeRegistry(runtimeRegistry([empty, child]));
    await app.start();
    const dispatcher = app.rootContainer.get(EventDispatcher);

    await expect(dispatcher.dispatch(new EmptyEvent())).resolves.toBeUndefined();
    await expect(dispatcher.dispatch(new DecoratedChild())).resolves.toBeUndefined();
    await expect(dispatcher.dispatch(new UndecoratedChild())).rejects.toBeInstanceOf(EventDispatchError);
    await expect(dispatcher.dispatch(new PlainEvent())).rejects.toBeInstanceOf(EventDispatchError);
    expect(empty.alias).toBe("empty");
  });

  it("supports nested dispatch with an independent child invocation", async () => {
    const order: string[] = [];
    @Event()
    class OuterEvent {}
    @Event()
    class InnerEvent {}
    @Listener(OuterEvent)
    class OuterListener {
      constructor(private readonly events: EventDispatcher) {}
      async handle(_event: OuterEvent): Promise<void> {
        order.push("outer:before");
        await this.events.dispatch(new InnerEvent());
        order.push("outer:after");
      }
    }
    @Listener(InnerEvent)
    class InnerListener {
      handle(_event: InnerEvent): void { order.push("inner"); }
    }
    const outerListener = defineListenerDefinition({
      target: OuterListener,
      event: OuterEvent,
      dependencies: [{ index: 0, token: EventDispatcher }],
    });
    const innerListener = defineListenerDefinition({ target: InnerListener, event: InnerEvent });
    const app = defineApp().withRuntimeRegistry(runtimeRegistry([
      defineEventDefinition({ target: OuterEvent, listeners: [outerListener] }),
      defineEventDefinition({ target: InnerEvent, listeners: [innerListener] }),
    ]));
    await app.start();
    await app.rootContainer.get(EventDispatcher).dispatch(new OuterEvent());
    expect(order).toEqual(["outer:before", "inner", "outer:after"]);
  });

  it("keeps concurrent dispatch iteration and event instances independent", async () => {
    const releases = new Map<string, () => void>();
    const entered: string[] = [];
    const completed: string[] = [];
    @Event()
    class ConcurrentEvent {
      constructor(readonly id: string) {}
    }
    @Listener(ConcurrentEvent)
    class ConcurrentListener {
      async handle(event: ConcurrentEvent): Promise<void> {
        entered.push(event.id);
        await new Promise<void>((resolve) => releases.set(event.id, resolve));
        completed.push(event.id);
      }
    }
    const listener = defineListenerDefinition({ target: ConcurrentListener, event: ConcurrentEvent });
    const app = defineApp().withRuntimeRegistry(runtimeRegistry([
      defineEventDefinition({ target: ConcurrentEvent, listeners: [listener] }),
    ]));
    await app.start();
    const dispatcher = app.rootContainer.get(EventDispatcher);
    const first = dispatcher.dispatch(new ConcurrentEvent("first"));
    const second = dispatcher.dispatch(new ConcurrentEvent("second"));
    await Promise.resolve();
    expect(entered).toEqual(["first", "second"]);
    releases.get("second")?.();
    await second;
    releases.get("first")?.();
    await first;
    expect(completed).toEqual(["second", "first"]);
  });

  it("boots Providers once per event dispatch rather than once per listener", async () => {
    let boots = 0;
    @Provider()
    class BootProvider {
      register(): void {}
      boot(): void { boots += 1; }
    }
    @Event()
    class BootEvent {}
    @Listener(BootEvent)
    class FirstBootListener { handle(_event: BootEvent): void {} }
    @Listener(BootEvent)
    class SecondBootListener { handle(_event: BootEvent): void {} }
    const listeners = [FirstBootListener, SecondBootListener].map((target) => (
      defineListenerDefinition({ target, event: BootEvent })
    ));
    const app = defineApp()
      .withProviders(BootProvider)
      .withRuntimeRegistry(runtimeRegistry([
        defineEventDefinition({ target: BootEvent, listeners }),
      ]));
    await app.start();
    const dispatcher = app.rootContainer.get(EventDispatcher);
    await dispatcher.dispatch(new BootEvent());
    await dispatcher.dispatch(new BootEvent());
    expect(boots).toBe(2);
  });

  it("allows normal Provider precedence to replace the default dispatcher", async () => {
    const recorded: object[] = [];
    class FakeDispatcher extends EventDispatcher {
      override async dispatch(event: object): Promise<void> { recorded.push(event); }
    }
    const fake = new FakeDispatcher();
    @Provider()
    class FakeEventProvider {
      register(container: import("@bunwire/core").Container): void {
        container.instance(EventDispatcher, fake);
      }
    }
    const app = defineApp().withProviders(FakeEventProvider);
    await app.start();
    const event = {};
    await app.rootContainer.get(EventDispatcher).dispatch(event);
    expect(recorded).toEqual([event]);
  });
});
