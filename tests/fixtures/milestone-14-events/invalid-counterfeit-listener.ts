import {
  Event,
  LISTENER_KIND,
  defineManagedClassDecorator,
} from "@bunwire/core";

export const Listener = defineManagedClassDecorator<
  new () => object,
  undefined,
  "core.listener.decorator"
>({
  id: "core.listener.decorator",
  compilerSymbol: { moduleSpecifier: "fixture.counterfeit", exportName: "Listener" },
  kind: LISTENER_KIND,
  createMetadata: () => undefined,
});

@Event()
export class ValidEvent {}

@Listener(ValidEvent)
export class CounterfeitListener {
  handle(_event: ValidEvent): void {}
}
