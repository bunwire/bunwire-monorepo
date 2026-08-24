import { Controller, Use } from "@bunwire/core";
export const callback = (_invocation: unknown, next: () => Promise<unknown>) => next();
@Use(callback) @Controller() export class Invalid {}
