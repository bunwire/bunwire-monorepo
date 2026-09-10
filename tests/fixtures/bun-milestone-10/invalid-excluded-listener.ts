import { Listener } from "@bunwire/core";
import { ExcludedEvent } from "./excluded-event.js";
@Listener(ExcludedEvent)
export class ExcludedListener {
  handle(_event: ExcludedEvent): void {}
}
