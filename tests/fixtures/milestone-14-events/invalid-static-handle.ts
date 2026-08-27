import { Event, Listener } from "@bunwire/core";

@Event()
export class ValidEvent {}

@Listener(ValidEvent)
export class StaticHandle {
  static handle(_event: ValidEvent): void {}
}

