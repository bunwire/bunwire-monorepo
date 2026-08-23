import { Middleware } from "@bunwire/core";

@Middleware()
export class GetterMetadataMiddleware {
  protected get alias(): string { return "getter"; }
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
