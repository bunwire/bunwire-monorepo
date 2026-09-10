import { Get } from "@bunwire/bun";
import { Controller, Middleware, Use } from "@bunwire/core";

@Middleware()
export class ConflictingAuthMiddleware {
  protected alias = "auth";
  handle(): void {}
}

@Controller()
export class InvalidController {
  @Use(ConflictingAuthMiddleware)
  @Get()
  index(): object { return {}; }
}
