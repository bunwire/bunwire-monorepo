import { Event, Listener } from "@bunwire/core";

@Event()
export class ValidEvent {}

@Listener(ValidEvent)
export class MissingHandle {}

