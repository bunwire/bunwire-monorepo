import { Context, CsrfMiddleware, Post, type BunHttpContext } from "@bunwire/bun";
import { Controller, Use } from "@bunwire/core";

@Controller("/session")
@Use("csrf")
export class SessionController {
  @Post("/write")
  async direct(@Context() context: BunHttpContext): Promise<object> {
    return { token: context.csrf ? await context.csrf.token() : null };
  }

  @Use(CsrfMiddleware)
  @Post("/direct")
  async directClass(@Context() context: BunHttpContext): Promise<object> {
    return { token: context.csrf ? await context.csrf.token() : null };
  }

  middlewareType(): typeof CsrfMiddleware {
    return CsrfMiddleware;
  }
}
