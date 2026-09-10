import { Event, Listener } from "@bunwire/core";
import { Queue } from "@bunwire/bun";
@Event() export class Payload {}
@Listener(Payload) @Queue({ id: "policy", tries: 0 }) export class Observer { handle(_event: Payload): void {} }
