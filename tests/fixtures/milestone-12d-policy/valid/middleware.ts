import { Middleware } from "@bunwire/core";

@Middleware()
export class AuthMiddleware {
  protected alias = "auth";
  handle(_context: unknown, next: () => Promise<unknown>) { return next(); }
}

@Middleware()
export class AuditMiddleware {
  protected alias = "audit";
  handle(_context: unknown, next: () => Promise<unknown>) { return next(); }
}

@Middleware()
export class TraceMiddleware {
  protected alias = "trace";
  handle(_context: unknown, next: () => Promise<unknown>) { return next(); }
}
