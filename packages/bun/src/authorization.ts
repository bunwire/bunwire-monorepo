import {
  Middleware,
  createToken,
  type MiddlewareNext,
  type Token,
} from "@bunwire/core";
import type { BunAuthContext } from "./auth.js";
import { BunAuthorizationException } from "./exceptions.js";
import type { BunHttpContext } from "./http.js";
import type { BunMiddlewareContext } from "./middleware.js";

export interface BunAbilityContext<Principal = unknown, Resource = unknown> {
  readonly principal: Principal | undefined;
  readonly resource: Resource | undefined;
  readonly http: BunHttpContext<Principal>;
}

export type BunAbility<Principal = unknown, Resource = unknown> =
  (context: BunAbilityContext<Principal, Resource>) => boolean | Promise<boolean>;

export interface BunAuthorizationPolicy<Principal = unknown, Resource = unknown> {
  readonly name: string;
  readonly resolve?: (routeValue: string, context: BunHttpContext<Principal>) => Resource | undefined | Promise<Resource | undefined>;
  readonly abilities: Readonly<Record<string, BunAbility<Principal, Resource>>>;
}

export interface BunAuthorizationOptions<Principal = unknown> {
  readonly abilities?: Readonly<Record<string, BunAbility<Principal>>>;
  readonly policies?: readonly BunAuthorizationPolicy<Principal, any>[];
}

export interface BunAuthorizationCheckOptions<Resource = unknown> {
  readonly policy?: string;
  readonly resource?: Resource;
}

export interface BunAuthorizationEvaluation<Principal = unknown, Resource = unknown> {
  readonly ability: string;
  readonly principal: Principal | undefined;
  readonly http: BunHttpContext<Principal>;
  readonly policy?: string;
  readonly resource?: Resource;
}

export class BunAuthorizationError extends Error {
  override readonly name = "BunAuthorizationError";
}

export const BUN_AUTHORIZATION_MANAGER: Token<AuthorizationManager<unknown>> =
  createToken<AuthorizationManager<unknown>>("bunwire.bun.authorization-manager");
export const BUN_AUTHORIZATION_CONTEXT: Token<BunAuthorizationContext<unknown>> =
  createToken<BunAuthorizationContext<unknown>>("bunwire.bun.authorization-context");

function assertName(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(value)) {
    throw new BunAuthorizationError(`${label} must be a non-empty stable identifier.`);
  }
}

function assertPolicyName(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new BunAuthorizationError("Authorization policy names must be valid Bun route-parameter identifiers.");
  }
}

function normalizeAbilities<Principal, Resource>(
  abilities: Readonly<Record<string, BunAbility<Principal, Resource>>> | undefined,
  label: string,
): ReadonlyMap<string, BunAbility<Principal, Resource>> {
  if (abilities === undefined) return new Map();
  if (!abilities || typeof abilities !== "object" || Array.isArray(abilities)) {
    throw new BunAuthorizationError(`${label} must be an ability-to-handler object.`);
  }
  const result = new Map<string, BunAbility<Principal, Resource>>();
  for (const [name, handler] of Object.entries(abilities)) {
    assertName(name, `${label} ability name`);
    if (typeof handler !== "function") throw new BunAuthorizationError(`${label} ability ${JSON.stringify(name)} must be callable.`);
    result.set(name, handler);
  }
  return result;
}

export function validateBunAuthorizationOptions<Principal>(options: BunAuthorizationOptions<Principal>): void {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new BunAuthorizationError("Authorization options must be an object.");
  }
  normalizeAbilities(options.abilities, "Authorization");
  if (options.policies !== undefined && !Array.isArray(options.policies)) {
    throw new BunAuthorizationError("Authorization policies must be an array.");
  }
  const names = new Set<string>();
  for (const policy of options.policies ?? []) {
    if (!policy || typeof policy !== "object") throw new BunAuthorizationError("Authorization policies must be objects.");
    assertPolicyName(policy.name);
    if (names.has(policy.name)) throw new BunAuthorizationError(`Authorization policy ${JSON.stringify(policy.name)} is registered more than once.`);
    names.add(policy.name);
    if (policy.resolve !== undefined && typeof policy.resolve !== "function") {
      throw new BunAuthorizationError(`Authorization policy ${JSON.stringify(policy.name)} resolve must be callable.`);
    }
    normalizeAbilities(policy.abilities, `Authorization policy ${JSON.stringify(policy.name)}`);
  }
}

interface NormalizedPolicy<Principal> {
  readonly name: string;
  readonly resolve?: BunAuthorizationPolicy<Principal>["resolve"];
  readonly abilities: ReadonlyMap<string, BunAbility<Principal, any>>;
}

export class AuthorizationManager<Principal = unknown> {
  readonly abilities: ReadonlyMap<string, BunAbility<Principal>>;
  readonly policies: ReadonlyMap<string, NormalizedPolicy<Principal>>;

  constructor(options: BunAuthorizationOptions<Principal>) {
    validateBunAuthorizationOptions(options);
    this.abilities = normalizeAbilities(options.abilities, "Authorization");
    this.policies = new Map((options.policies ?? []).map((policy) => [policy.name, Object.freeze({
      name: policy.name,
      ...(policy.resolve ? { resolve: policy.resolve } : {}),
      abilities: normalizeAbilities(policy.abilities, `Authorization policy ${JSON.stringify(policy.name)}`),
    })]));
  }

  hasAbility(ability: string, policy?: string): boolean {
    return policy === undefined
      ? this.abilities.has(ability)
      : this.policies.get(policy)?.abilities.has(ability) === true;
  }

  async can<Resource = unknown>(evaluation: BunAuthorizationEvaluation<Principal, Resource>): Promise<boolean> {
    assertName(evaluation.ability, "Authorization ability");
    if (evaluation.policy === undefined) {
      const ability = this.abilities.get(evaluation.ability);
      return ability ? Boolean(await ability(Object.freeze({
        principal: evaluation.principal,
        resource: evaluation.resource,
        http: evaluation.http,
      }))) : false;
    }
    const policy = this.policies.get(evaluation.policy);
    const ability = policy?.abilities.get(evaluation.ability);
    if (!policy || !ability) return false;
    let resource: unknown = evaluation.resource;
    if (resource === undefined) {
      const routeValue = evaluation.http.route.params[policy.name];
      if (routeValue === undefined) return false;
      resource = policy.resolve ? await policy.resolve(routeValue, evaluation.http) : routeValue;
    }
    if (resource === undefined) return false;
    return Boolean(await ability(Object.freeze({
      principal: evaluation.principal,
      resource,
      http: evaluation.http,
    })));
  }

  async authorize<Resource = unknown>(evaluation: BunAuthorizationEvaluation<Principal, Resource>): Promise<void> {
    if (!await this.can(evaluation)) throw new BunAuthorizationException();
  }

  createContext(
    http: () => BunHttpContext<Principal>,
    auth?: BunAuthContext<Principal>,
  ): BunAuthorizationContext<Principal> {
    return new BunAuthorizationContext(this, http, auth);
  }
}

export class BunAuthorizationContext<Principal = unknown> {
  readonly #manager: AuthorizationManager<Principal>;
  readonly #http: () => BunHttpContext<Principal>;
  readonly #auth: BunAuthContext<Principal> | undefined;

  /** @internal */
  constructor(
    manager: AuthorizationManager<Principal>,
    http: () => BunHttpContext<Principal>,
    auth?: BunAuthContext<Principal>,
  ) {
    this.#manager = manager;
    this.#http = http;
    this.#auth = auth;
    Object.freeze(this);
  }

  can<Resource = unknown>(ability: string, options: BunAuthorizationCheckOptions<Resource> = {}): Promise<boolean> {
    return this.#manager.can({
      ability,
      principal: this.#auth?.principal,
      http: this.#http(),
      ...(options.policy === undefined ? {} : { policy: options.policy }),
      ...(options.resource === undefined ? {} : { resource: options.resource }),
    });
  }

  authorize<Resource = unknown>(ability: string, options: BunAuthorizationCheckOptions<Resource> = {}): Promise<void> {
    return this.#manager.authorize({
      ability,
      principal: this.#auth?.principal,
      http: this.#http(),
      ...(options.policy === undefined ? {} : { policy: options.policy }),
      ...(options.resource === undefined ? {} : { resource: options.resource }),
    });
  }
}

@Middleware()
export class AuthorizeMiddleware {
  async handle(context: BunMiddlewareContext, next: MiddlewareNext<Response>): Promise<Response> {
    if (!context.authorization) throw new BunAuthorizationError("The can middleware requires configured Bun authorization.");
    if (context.parameters.length < 1 || context.parameters.length > 2) {
      throw new BunAuthorizationError("The can middleware requires an ability and accepts one optional policy name.");
    }
    await context.authorization.authorize(context.parameters[0]!, {
      ...(context.parameters[1] ? { policy: context.parameters[1] } : {}),
    });
    return next();
  }
}
