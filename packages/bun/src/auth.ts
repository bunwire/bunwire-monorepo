import {
  Middleware,
  createToken,
  type MiddlewareNext,
  type Token,
} from "@bunwire/core";
import { BunAuthorizationException, BunUnauthenticatedException } from "./exceptions.js";
import type { BunHttpContext } from "./http.js";
import type { BunMiddlewareContext } from "./middleware.js";
import type { BunOAuthOptions } from "./oauth.js";
import {
  BUN_SESSION_FRAMEWORK_DELETE,
  BUN_SESSION_FRAMEWORK_GET,
  BUN_SESSION_FRAMEWORK_SET,
  type BunSessionValue,
  type Session,
} from "./sessions.js";

export interface BunAuthGuardContext<Principal = unknown> {
  readonly http: BunHttpContext<Principal>;
  readonly session?: Session;
}

export interface BunAuthGuard<Principal = unknown> {
  readonly name: string;
  readonly requiresSession?: boolean;
  authenticate(context: BunAuthGuardContext<Principal>): Principal | undefined | Promise<Principal | undefined>;
  login?(principal: Principal, context: BunAuthGuardContext<Principal>): void | Promise<void>;
  logout?(context: BunAuthGuardContext<Principal>): void | Promise<void>;
}

export interface BunSessionAuthGuardOptions<Principal, Key extends BunSessionValue = BunSessionValue> {
  readonly name?: string;
  readonly identify: (principal: Principal, context: BunAuthGuardContext<Principal>) => Key | Promise<Key>;
  readonly resolve: (key: Key, context: BunAuthGuardContext<Principal>) => Principal | undefined | Promise<Principal | undefined>;
}

export interface BunBearerAuthGuardOptions<Principal> {
  readonly name?: string;
  readonly resolve: (token: string, context: BunAuthGuardContext<Principal>) => Principal | undefined | Promise<Principal | undefined>;
}

export interface BunAuthenticationOptions<Principal = unknown> {
  readonly defaultGuard: string;
  readonly guards: readonly BunAuthGuard<Principal>[];
  readonly oauth?: BunOAuthOptions<Principal>;
}

export class BunAuthError extends Error {
  override readonly name = "BunAuthError";
}

export const BUN_AUTH_MANAGER: Token<AuthManager<unknown>> =
  createToken<AuthManager<unknown>>("bunwire.bun.auth-manager");
export const BUN_AUTH_CONTEXT: Token<BunAuthContext<unknown>> =
  createToken<BunAuthContext<unknown>>("bunwire.bun.auth-context");

/** @internal Request authentication initialization boundary. */
export const BUN_AUTH_INITIALIZE: unique symbol = Symbol("bun.auth.initialize");

function assertGuardName(name: unknown, label: string): asserts name is string {
  if (typeof name !== "string" || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
    throw new BunAuthError(`${label} must be a non-empty identifier containing letters, numbers, '_' or '-'.`);
  }
}

function assertGuard<Principal>(guard: BunAuthGuard<Principal>): void {
  if (!guard || typeof guard !== "object") throw new BunAuthError("Authentication guards must be objects.");
  assertGuardName(guard.name, "Authentication guard name");
  if (typeof guard.authenticate !== "function") {
    throw new BunAuthError(`Authentication guard ${JSON.stringify(guard.name)} must define authenticate().`);
  }
  if (guard.login !== undefined && typeof guard.login !== "function") {
    throw new BunAuthError(`Authentication guard ${JSON.stringify(guard.name)} login must be callable.`);
  }
  if (guard.logout !== undefined && typeof guard.logout !== "function") {
    throw new BunAuthError(`Authentication guard ${JSON.stringify(guard.name)} logout must be callable.`);
  }
  if (guard.requiresSession !== undefined && typeof guard.requiresSession !== "boolean") {
    throw new BunAuthError(`Authentication guard ${JSON.stringify(guard.name)} requiresSession must be boolean.`);
  }
}

export function validateBunAuthenticationOptions<Principal>(options: BunAuthenticationOptions<Principal>): void {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new BunAuthError("Authentication options must be an object.");
  }
  assertGuardName(options.defaultGuard, "Authentication defaultGuard");
  if (!Array.isArray(options.guards) || options.guards.length === 0) {
    throw new BunAuthError("Authentication requires at least one guard.");
  }
  const names = new Set<string>();
  for (const guard of options.guards) {
    assertGuard(guard);
    if (names.has(guard.name)) throw new BunAuthError(`Authentication guard ${JSON.stringify(guard.name)} is registered more than once.`);
    names.add(guard.name);
  }
  if (!names.has(options.defaultGuard)) {
    throw new BunAuthError(`Authentication default guard ${JSON.stringify(options.defaultGuard)} is not registered.`);
  }
}

function sessionKey(name: string): string {
  return `auth:${name}`;
}

export function createSessionAuthGuard<Principal, Key extends BunSessionValue = BunSessionValue>(
  options: BunSessionAuthGuardOptions<Principal, Key>,
): BunAuthGuard<Principal> {
  if (!options || typeof options !== "object" || typeof options.identify !== "function" || typeof options.resolve !== "function") {
    throw new BunAuthError("Session authentication requires callable identify and resolve hooks.");
  }
  const name = options.name ?? "session";
  assertGuardName(name, "Session authentication guard name");
  return Object.freeze({
    name,
    requiresSession: true,
    async authenticate(context: BunAuthGuardContext<Principal>): Promise<Principal | undefined> {
      const session = context.session;
      if (!session) throw new BunAuthError(`Session authentication guard ${JSON.stringify(name)} requires an active session.`);
      const key = session[BUN_SESSION_FRAMEWORK_GET]<Key>(sessionKey(name));
      return key === undefined ? undefined : await options.resolve(key, context);
    },
    async login(principal: Principal, context: BunAuthGuardContext<Principal>): Promise<void> {
      const session = context.session;
      if (!session) throw new BunAuthError(`Session authentication guard ${JSON.stringify(name)} requires an active session.`);
      const key = await options.identify(principal, context);
      session.regenerate();
      session[BUN_SESSION_FRAMEWORK_SET](sessionKey(name), key);
    },
    async logout(context: BunAuthGuardContext<Principal>): Promise<void> {
      const session = context.session;
      if (!session) throw new BunAuthError(`Session authentication guard ${JSON.stringify(name)} requires an active session.`);
      session[BUN_SESSION_FRAMEWORK_DELETE](sessionKey(name));
      session.regenerate();
    },
  });
}

export function createBearerAuthGuard<Principal>(
  options: BunBearerAuthGuardOptions<Principal>,
): BunAuthGuard<Principal> {
  if (!options || typeof options !== "object" || typeof options.resolve !== "function") {
    throw new BunAuthError("Bearer authentication requires a callable resolve hook.");
  }
  const name = options.name ?? "bearer";
  assertGuardName(name, "Bearer authentication guard name");
  return Object.freeze({
    name,
    async authenticate(context: BunAuthGuardContext<Principal>): Promise<Principal | undefined> {
      const header = context.http.request.headers.get("authorization");
      if (!header) return undefined;
      const match = /^Bearer[ \t]+([^\s]+)$/i.exec(header);
      return match ? await options.resolve(match[1]!, context) : undefined;
    },
  });
}

export class AuthManager<Principal = unknown> {
  readonly defaultGuard: string;
  readonly guards: ReadonlyMap<string, BunAuthGuard<Principal>>;

  constructor(options: BunAuthenticationOptions<Principal>) {
    validateBunAuthenticationOptions(options);
    this.defaultGuard = options.defaultGuard;
    this.guards = new Map(options.guards.map((guard) => [guard.name, guard]));
  }

  guard(name: string = this.defaultGuard): BunAuthGuard<Principal> {
    const guard = this.guards.get(name);
    if (!guard) throw new BunAuthError(`Authentication guard ${JSON.stringify(name)} is not registered.`);
    return guard;
  }

  createContext(http: () => BunHttpContext<Principal>): BunAuthContext<Principal> {
    return new BunAuthContext(this, http);
  }
}

export class BunAuthContext<Principal = unknown> {
  readonly #manager: AuthManager<Principal>;
  readonly #http: () => BunHttpContext<Principal>;
  readonly #cache = new Map<string, Principal | undefined>();
  #guard: string;
  #principal: Principal | undefined;
  #initialized = false;

  /** @internal */
  constructor(manager: AuthManager<Principal>, http: () => BunHttpContext<Principal>) {
    this.#manager = manager;
    this.#http = http;
    this.#guard = manager.defaultGuard;
    Object.freeze(this);
  }

  get guard(): string { return this.#guard; }
  get principal(): Principal | undefined { this.assertInitialized(); return this.#principal; }
  get user(): Principal | undefined { return this.principal; }
  check(): boolean { return this.principal !== undefined; }
  guest(): boolean { return !this.check(); }

  async authenticate(name: string = this.#manager.defaultGuard): Promise<Principal | undefined> {
    const guard = this.#manager.guard(name);
    let principal: Principal | undefined;
    if (this.#cache.has(name)) principal = this.#cache.get(name);
    else {
      principal = await guard.authenticate(this.guardContext());
      this.#cache.set(name, principal);
    }
    this.#guard = name;
    this.#principal = principal;
    this.#initialized = true;
    return principal;
  }

  async login(principal: Principal, name: string = this.#manager.defaultGuard): Promise<void> {
    const guard = this.#manager.guard(name);
    if (!guard.login) throw new BunAuthError(`Authentication guard ${JSON.stringify(name)} does not support login().`);
    await guard.login(principal, this.guardContext());
    this.#cache.set(name, principal);
    this.#guard = name;
    this.#principal = principal;
    this.#initialized = true;
  }

  async logout(name: string = this.#guard): Promise<void> {
    const guard = this.#manager.guard(name);
    if (!guard.logout) throw new BunAuthError(`Authentication guard ${JSON.stringify(name)} does not support logout().`);
    await guard.logout(this.guardContext());
    this.#cache.set(name, undefined);
    if (this.#guard === name) this.#principal = undefined;
    this.#initialized = true;
  }

  /** @internal */
  async [BUN_AUTH_INITIALIZE](): Promise<void> {
    await this.authenticate(this.#manager.defaultGuard);
  }

  private guardContext(): BunAuthGuardContext<Principal> {
    const http = this.#http();
    return Object.freeze({ http, ...(http.session ? { session: http.session } : {}) });
  }

  private assertInitialized(): void {
    if (!this.#initialized) throw new BunAuthError("Authentication context was read before request initialization completed.");
  }
}

function selectedGuard(context: BunMiddlewareContext): string | undefined {
  if (context.parameters.length > 1) throw new BunAuthError("Authentication middleware accepts at most one guard name.");
  return context.parameters[0];
}

@Middleware()
export class AuthenticateMiddleware {
  async handle(context: BunMiddlewareContext, next: MiddlewareNext<Response>): Promise<Response> {
    if (!context.auth) throw new BunAuthError("The auth middleware requires configured Bun authentication.");
    const principal = await context.auth.authenticate(selectedGuard(context));
    if (principal === undefined) throw new BunUnauthenticatedException();
    return next();
  }
}

@Middleware()
export class GuestMiddleware {
  async handle(context: BunMiddlewareContext, next: MiddlewareNext<Response>): Promise<Response> {
    if (!context.auth) throw new BunAuthError("The guest middleware requires configured Bun authentication.");
    const principal = await context.auth.authenticate(selectedGuard(context));
    if (principal !== undefined) throw new BunAuthorizationException();
    return next();
  }
}
