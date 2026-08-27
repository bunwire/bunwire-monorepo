import { Event, Listener } from "@bunwire/core";

@Event()
export class ValidEvent {}

@Listener(ValidEvent)
export class ExtraParameterHandle {
  handle(_event: ValidEvent, _extra: string): void {}
}

