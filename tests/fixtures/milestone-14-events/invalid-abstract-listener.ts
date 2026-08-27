import { Event, Listener } from "@bunwire/core";

@Event()
export class ValidEvent {}

@Listener(ValidEvent)
export abstract class AbstractListener {
  abstract handle(event: ValidEvent): void;
}

