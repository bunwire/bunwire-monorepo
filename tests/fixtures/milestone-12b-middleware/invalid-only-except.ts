import { Middleware } from "@bunwire/core";

@Middleware()
export class ConflictingTransportMiddleware {
  protected only = ["request"];
  protected except = ["message"];
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
