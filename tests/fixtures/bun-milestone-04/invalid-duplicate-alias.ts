import { Get } from "@bunwire/bun";
import { Controller, Middleware } from "@bunwire/core";

@Middleware()
export class FirstMiddleware {
  protected alias = "duplicate";
  handle(_context: unknown, next: () => Promise<unknown>) { return next(); }
}

@Middleware()
export class SecondMiddleware {
  protected alias = "duplicate";
  handle(_context: unknown, next: () => Promise<unknown>) { return next(); }
}

@Controller("/api")
export class DuplicateAliasController {
  @Get()
  index(): Response { return new Response(); }
}
