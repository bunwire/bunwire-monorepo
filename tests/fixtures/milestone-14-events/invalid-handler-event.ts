import { Event, Listener } from "@bunwire/core";

@Event()
export class ExpectedEvent {}

@Event()
export class OtherEvent {}

@Listener(ExpectedEvent)
export class WrongEventHandle {
  handle(_event: OtherEvent): void {}
}

