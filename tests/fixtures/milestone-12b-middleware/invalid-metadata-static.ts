import { Middleware } from "@bunwire/core";

@Middleware()
export class StaticMetadataMiddleware {
  protected static alias = "static";
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
