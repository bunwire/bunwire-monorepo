import { Controller, Use, type ManagedMethodMiddleware } from "@bunwire/core";
export const callback: ManagedMethodMiddleware = (_invocation, next) => next();
@Use(callback) @Controller() export class Invalid {}
