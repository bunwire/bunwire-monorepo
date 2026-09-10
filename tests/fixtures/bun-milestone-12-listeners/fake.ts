import { Event, Listener } from "@bunwire/core";
import { Queue } from "@bunwire/bun";
const Fake = Object.assign((_options: { id: string }): ClassDecorator => () => {}, { definition: Queue.definition });
@Event() export class Payload {}
@Listener(Payload) @Fake({ id: "fake" }) export class Observer { handle(_event: Payload): void {} }
