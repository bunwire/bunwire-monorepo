import { Middleware } from "@bunwire/core";

interface InterfaceDependency {}

@Middleware()
export class InterfaceDependencyMiddleware {
  constructor(readonly dependency: InterfaceDependency) {}
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
