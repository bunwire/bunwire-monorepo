import { Middleware } from "@bunwire/core";

@Middleware()
export class EmptyMetadataMiddleware {
  protected exclude = ["   "];
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
