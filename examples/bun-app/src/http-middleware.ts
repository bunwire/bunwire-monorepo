import type { BunMiddlewareContext } from "@bunwire/bun";
import { Middleware } from "@bunwire/core";

@Middleware()
export class ExampleHttpMiddleware {
  protected alias = "example-http";
  protected include = ["/api/**"];
  protected only = ["GET", "POST"];

  async handle(
    context: BunMiddlewareContext,
    next: () => Promise<unknown>,
  ): Promise<unknown> {
    const result = await next();
    if (result instanceof Response) {
      result.headers.set("x-bunwire-middleware", context.parameters[0] ?? "active");
      result.headers.set("x-bunwire-method", context.method);
      result.headers.set("x-bunwire-path", context.path);
    }
    return result;
  }
}

@Middleware()
export class ExampleGuardMiddleware {
  protected alias = "example-guard";

  handle(context: BunMiddlewareContext, next: () => Promise<unknown>): unknown {
    if (context.parameters[0] === "deny") {
      return new Response("Blocked by example middleware", { status: 403 });
    }
    return next();
  }
}
