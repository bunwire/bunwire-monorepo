import { Middleware } from "@bunwire/core";

@Middleware()
export class ConstructorMetadataMiddleware {
  protected alias!: string;
  constructor() { this.alias = "assigned"; }
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
