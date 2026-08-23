import { Middleware } from "@bunwire/core";

@Middleware()
class UnexportedMiddleware {
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}

export const reference = UnexportedMiddleware;
