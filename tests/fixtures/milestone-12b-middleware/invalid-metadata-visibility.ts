import { Middleware } from "@bunwire/core";

@Middleware()
export class VisibilityMetadataMiddleware {
  public alias = "public";
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
