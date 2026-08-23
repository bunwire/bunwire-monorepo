import { Middleware } from "@bunwire/core";

@Middleware()
export class FirstDuplicateAliasMiddleware {
  protected alias = "duplicate";
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
