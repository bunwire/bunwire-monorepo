import { Middleware } from "@bunwire/core";

const paths = ["/dynamic"];

@Middleware()
export class SpreadMetadataMiddleware {
  protected include = ["/literal", ...paths];
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
