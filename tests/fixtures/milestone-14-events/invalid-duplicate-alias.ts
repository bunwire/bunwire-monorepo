import { Event } from "@bunwire/core";

@Event()
export class FirstEvent {
  protected alias = "duplicate.event";
}

@Event()
export class SecondEvent {
  protected alias = "duplicate.event";
}

