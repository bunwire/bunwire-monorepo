import { Middleware } from "@bunwire/core";

@Middleware()
export class TypeMetadataMiddleware {
  protected include = ["/valid", 42];
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
