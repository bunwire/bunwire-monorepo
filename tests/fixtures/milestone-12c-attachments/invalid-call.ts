import { Controller, Middleware, Use } from "@bunwire/core";
@Middleware() export class AuthMiddleware { handle() {} }
const middleware = () => AuthMiddleware;
@Use(middleware()) @Controller() export class Invalid {}
