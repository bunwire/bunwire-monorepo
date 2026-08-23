import { Middleware } from "@bunwire/core";

@Middleware()
export class DuplicateMetadataMiddleware {
  protected only = ["request", "request"];
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
