import {
  AuthenticateMiddleware,
  AuthorizeMiddleware,
  Get,
  GuestMiddleware,
} from "@bunwire/bun";
import { Controller, Use } from "@bunwire/core";

@Controller("/security")
export class SecurityController {
  @Use("auth")
  @Get("/account")
  account(): object { return {}; }

  @Use(GuestMiddleware)
  @Get("/login")
  login(): object { return {}; }

  @Use("can:update,post")
  @Get("/posts/:post")
  update(): object { return {}; }

  @Use(AuthenticateMiddleware, AuthorizeMiddleware)
  @Get("/direct/:post")
  direct(): object { return {}; }
}
