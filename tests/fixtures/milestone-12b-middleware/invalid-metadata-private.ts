import { Middleware } from "@bunwire/core";

@Middleware()
export class PrivateMetadataMiddleware {
  private alias = "private";
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
