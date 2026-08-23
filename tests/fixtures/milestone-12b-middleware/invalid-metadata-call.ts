import { Middleware } from "@bunwire/core";

@Middleware()
export class CallMetadataMiddleware {
  protected include = Array.of("/dynamic");
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
