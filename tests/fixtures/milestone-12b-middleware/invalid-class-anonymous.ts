import { Middleware } from "@bunwire/core";

@Middleware()
export default class {
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
