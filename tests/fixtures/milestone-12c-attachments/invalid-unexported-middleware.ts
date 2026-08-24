import { Controller, Middleware, Use } from "@bunwire/core";
@Middleware() class HiddenMiddleware { handle() {} }
@Use(HiddenMiddleware) @Controller() export class Invalid {}
