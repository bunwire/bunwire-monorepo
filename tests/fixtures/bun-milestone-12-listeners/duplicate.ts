import { Event, Listener } from "@bunwire/core";
import { Job, Queue } from "@bunwire/bun";
@Event() export class Payload {}
@Job({ id: "same" }) export class Task { handle(): void {} }
@Listener(Payload) @Queue({ id: "same" }) export class Observer { handle(_event: Payload): void {} }
