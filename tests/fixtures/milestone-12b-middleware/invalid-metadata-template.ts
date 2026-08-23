import { Middleware } from "@bunwire/core";

@Middleware()
export class TemplateMetadataMiddleware {
  protected alias = `template`;
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
