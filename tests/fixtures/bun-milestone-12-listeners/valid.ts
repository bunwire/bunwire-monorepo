import { Event, Listener, Inject } from "@bunwire/core";
import { BUN_JOB_CONTEXT, Queue, type BunJobContext } from "@bunwire/bun";
import { Background } from "./reexports.js";
@Event() export class Payload { constructor(readonly id: string) {} }
@Background({ id: "first" }) @Listener(Payload) export class First {
  constructor(@Inject(BUN_JOB_CONTEXT) private readonly context: BunJobContext) {}
  handle(_event: Payload): void { void this.context; }
}
@Listener(Payload) @Queue({ id: "second", queue: "notifications", tries: 3, timeout: 100, backoff: [10, 30] })
export class Second { handle(_event: Payload): void {} }
