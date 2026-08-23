import { Middleware } from "@bunwire/core";

@Middleware()
export class ComputedMetadataMiddleware {
  protected ["alias"] = "computed";
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
