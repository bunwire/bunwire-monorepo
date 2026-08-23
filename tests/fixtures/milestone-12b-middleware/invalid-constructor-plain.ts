import { Middleware } from "@bunwire/core";

class PlainDependency {}

@Middleware()
export class PlainDependencyMiddleware {
  constructor(readonly dependency: PlainDependency) {}
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
