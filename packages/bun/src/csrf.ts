import {
  Middleware,
  createToken,
  type MiddlewareNext,
  type Token,
} from "@bunwire/core";
import { BunCsrfMismatchException } from "./exceptions.js";
import type { BunMiddlewareContext } from "./middleware.js";
import { Session, SessionManager } from "./sessions.js";

export interface BunCsrfOptions {
  readonly headerName?: string;
  readonly fieldName?: string;
}

export interface BunCsrfContext {
  token(): Promise<string>;
  rotate(): Promise<string>;
}

export class BunCsrfError extends Error {
  override readonly name = "BunCsrfError";
}

export const BUN_CSRF_MANAGER: Token<CsrfManager> =
  createToken<CsrfManager>("bunwire.bun.csrf-manager");
export const BUN_CSRF_CONTEXT: Token<BunCsrfContext> =
  createToken<BunCsrfContext>("bunwire.bun.csrf-context");

export function validateBunCsrfOptions(options: BunCsrfOptions = {}): void {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new BunCsrfError("CSRF options must be an object.");
  if (options.headerName !== undefined && (typeof options.headerName !== "string" || options.headerName.trim().length === 0)) {
    throw new BunCsrfError("CSRF headerName must be a non-empty string.");
  }
  if (options.fieldName !== undefined && (typeof options.fieldName !== "string" || options.fieldName.trim().length === 0)) {
    throw new BunCsrfError("CSRF fieldName must be a non-empty string.");
  }
}

export class CsrfManager {
  readonly headerName: string;
  readonly fieldName: string;
  readonly #sessions: SessionManager;

  constructor(sessions: SessionManager, options: BunCsrfOptions = {}) {
    validateBunCsrfOptions(options);
    this.#sessions = sessions;
    this.headerName = options.headerName ?? "X-CSRF-TOKEN";
    this.fieldName = options.fieldName ?? "_token";
  }

  context(session: Session): BunCsrfContext {
    const manager = this;
    return Object.freeze({
      token: () => manager.#sessions.csrfToken(session),
      rotate: () => manager.#sessions.rotateCsrfToken(session),
    });
  }

  async verify(context: BunMiddlewareContext): Promise<void> {
    if (context.method === "GET" || context.method === "HEAD" || context.method === "OPTIONS") return;
    const csrf = context.csrf;
    if (!csrf) throw new BunCsrfError("CSRF middleware requires configured Bun HTTP sessions.");
    let supplied = context.request.headers.get(this.headerName) ?? undefined;
    if (!supplied) {
      const mediaType = (context.request.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase();
      if (mediaType === "application/x-www-form-urlencoded" || mediaType === "multipart/form-data") {
        const value = (await context.request.clone().formData()).get(this.fieldName);
        if (typeof value === "string") supplied = value;
      }
    }
    if (!supplied || !context.session
      || !await this.#sessions.verifyCsrfToken(context.session, supplied)) {
      throw new BunCsrfMismatchException();
    }
  }
}

@Middleware()
export class CsrfMiddleware {
  async handle(context: BunMiddlewareContext, next: MiddlewareNext<Response>): Promise<Response> {
    const manager = context.scope.resolve(BUN_CSRF_MANAGER);
    await manager.verify(context);
    return next();
  }
}
