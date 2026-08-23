import { Middleware } from "@bunwire/core";

@Middleware()
export class StaticHandleMiddleware {
  static async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
