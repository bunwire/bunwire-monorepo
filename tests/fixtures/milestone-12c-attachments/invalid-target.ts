import { Controller, Use } from "@bunwire/core";
class PlainMiddleware { handle() {} }
@Use(PlainMiddleware) @Controller() export class Invalid {}
