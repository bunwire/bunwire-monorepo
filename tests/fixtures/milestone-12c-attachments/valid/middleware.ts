import { Middleware as ManagedMiddleware } from "./reexports.js";

@ManagedMiddleware()
export class AuthMiddleware {
  protected alias = "auth";
  handle(_context: unknown, next: () => Promise<unknown>) { return next(); }
}

@ManagedMiddleware()
export class AuditMiddleware {
  protected alias = "audit";
  handle(_context: unknown, next: () => Promise<unknown>) { return next(); }
}
