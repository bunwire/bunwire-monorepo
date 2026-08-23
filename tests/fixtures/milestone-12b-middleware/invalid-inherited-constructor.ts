import { Middleware } from "@bunwire/core";

class RequiredBase {
  constructor(readonly dependency: string) {}
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}

@Middleware()
export class HiddenConstructorMiddleware extends RequiredBase {}
