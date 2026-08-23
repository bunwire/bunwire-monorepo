import {
  Inject,
  Middleware as ManagedMiddleware,
  type Middleware,
} from "@bunwire/core";
import { AUDIT_SINK, AuthService, type AuditSink } from "./dependencies.js";
import { ReexportedMiddleware } from "./reexports.js";

@ManagedMiddleware()
export class FullMetadataMiddleware implements Middleware<{ readonly path: string }, string> {
  protected alias = " auth ";
  protected include = ["/admin/**", "/account/*"];
  protected exclude = ["/admin/login"];
  protected only = ["request"];

  constructor(
    readonly auth: AuthService,
    @Inject(AUDIT_SINK) readonly audit: AuditSink,
  ) {}

  async handle(
    _context: { readonly path: string },
    next: () => Promise<string>,
  ): Promise<string> {
    return next();
  }
}

@ManagedMiddleware()
export class PartialMetadataMiddleware {
  protected except = ["message"];

  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> {
    return next();
  }
}

export class ConcreteMiddlewareBase {
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> {
    return next();
  }
}

@ReexportedMiddleware()
export class InheritedHandleMiddleware extends ConcreteMiddlewareBase {
  protected alias = "inherited";
}
