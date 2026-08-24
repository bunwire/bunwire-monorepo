import { Controller, Use } from "@bunwire/core";
const CounterfeitUse = Object.assign((..._entries: unknown[]): ClassDecorator => () => undefined, {
  definition: Use.definition,
});
@CounterfeitUse("auth") @Controller() export class Invalid {}
