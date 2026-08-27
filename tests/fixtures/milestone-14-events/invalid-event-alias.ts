import { Event } from "@bunwire/core";

@Event()
export class InvalidAliasEvent {
  public alias = "invalid.visibility";
}

