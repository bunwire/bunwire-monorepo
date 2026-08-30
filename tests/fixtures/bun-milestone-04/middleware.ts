import { Middleware } from "@bunwire/core";
import type { BunMiddlewareContext } from "@bunwire/bun";

@Middleware()
export class AuthMiddleware {
  protected alias = "auth";
  protected include = ["/api/**"];
  protected only = ["GET"];
  handle(_context: BunMiddlewareContext, next: () => Promise<unknown>) { return next(); }
}

@Middleware()
export class AuditMiddleware {
  protected alias = "audit";
  handle(_context: BunMiddlewareContext, next: () => Promise<unknown>) { return next(); }
}

@Middleware()
export class TraceMiddleware {
  protected alias = "trace";
  handle(_context: BunMiddlewareContext, next: () => Promise<unknown>) { return next(); }
}

@Middleware()
export class MethodAuditMiddleware {
  protected alias = "method-audit";
  handle(_context: BunMiddlewareContext, next: () => Promise<unknown>) { return next(); }
}
