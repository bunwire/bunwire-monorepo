import { Middleware } from "@bunwire/core";

const alias = "dynamic";

@Middleware()
export class IdentifierMetadataMiddleware {
  protected alias = alias;
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
