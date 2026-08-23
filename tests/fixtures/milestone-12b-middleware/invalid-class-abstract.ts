import { Middleware } from "@bunwire/core";

@Middleware()
export abstract class AbstractMiddleware {
  abstract handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown>;
}
