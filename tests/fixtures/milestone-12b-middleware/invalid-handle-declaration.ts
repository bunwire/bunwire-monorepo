import { Middleware } from "@bunwire/core";

@Middleware()
export class DeclarationHandleMiddleware {
  handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown>;
}
