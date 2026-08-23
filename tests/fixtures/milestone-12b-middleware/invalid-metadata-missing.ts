import { Middleware } from "@bunwire/core";

@Middleware()
export class MissingMetadataInitializerMiddleware {
  protected alias!: string;
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
