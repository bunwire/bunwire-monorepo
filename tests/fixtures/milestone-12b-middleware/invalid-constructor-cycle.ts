import { Middleware } from "@bunwire/core";

@Middleware()
export class FirstCycleMiddleware {
  constructor(readonly second: SecondCycleMiddleware) {}
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}

@Middleware()
export class SecondCycleMiddleware {
  constructor(readonly first: FirstCycleMiddleware) {}
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
