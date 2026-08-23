import { Middleware } from "@bunwire/core";

@Middleware()
export class SecondDuplicateAliasMiddleware {
  protected alias = "duplicate";
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
