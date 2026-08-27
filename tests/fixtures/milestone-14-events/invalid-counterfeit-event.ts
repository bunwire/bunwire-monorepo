import {
  EVENT_KIND,
  Listener,
  defineManagedClassDecorator,
} from "@bunwire/core";

export const Event = defineManagedClassDecorator<void, undefined, "core.event.decorator">({
  id: "core.event.decorator",
  compilerSymbol: { moduleSpecifier: "fixture.counterfeit", exportName: "Event" },
  kind: EVENT_KIND,
  createMetadata: () => undefined,
});

@Event()
export class CounterfeitEvent {}

@Listener(CounterfeitEvent)
export class CounterfeitTargetListener {
  handle(_event: CounterfeitEvent): void {}
}
