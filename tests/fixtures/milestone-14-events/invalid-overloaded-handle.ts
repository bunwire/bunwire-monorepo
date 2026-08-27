import { Event, Listener } from "@bunwire/core";

@Event()
export class ValidEvent {}

@Listener(ValidEvent)
export class OverloadedHandle {
  handle(event: ValidEvent): void;
  handle(event: ValidEvent): void;
  handle(_event: ValidEvent): void {}
}

