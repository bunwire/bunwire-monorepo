import { Listener } from "@bunwire/core";

export class PlainEvent {}

@Listener(PlainEvent)
export class InvalidListener {
  handle(_event: PlainEvent): void {}
}

