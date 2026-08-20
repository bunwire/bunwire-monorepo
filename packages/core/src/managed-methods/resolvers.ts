import type { InvocationContext } from "../application/invocation-context.js";
import { UnknownParameterResolverError } from "./errors.js";
import {
  createParameterResolverId,
  type ParameterResolverId,
} from "./identifiers.js";
import type { ManagedMethodPlan, ResolverParameterPlan } from "./plan.js";
import type { NamespacedIdentifier } from "../managed-classes/identifiers.js";

export interface ParameterResolutionRequest<Data = unknown> {
  readonly context: InvocationContext;
  readonly parameter: ResolverParameterPlan<Data>;
  readonly plan: ManagedMethodPlan;
}

export type ParameterResolver<Data = unknown> = (
  request: ParameterResolutionRequest<Data>,
) => unknown | Promise<unknown>;

export interface ParameterResolverDefinition<
  Id extends string = string,
  Data = unknown,
> {
  readonly id: ParameterResolverId<Id>;
  readonly resolve: ParameterResolver<Data>;
}

export interface DefineParameterResolverOptions<
  Id extends NamespacedIdentifier,
  Data,
> {
  readonly id: Id;
  readonly resolve: ParameterResolver<Data>;
}

export function defineParameterResolver<
  const Id extends NamespacedIdentifier,
  Data = unknown,
>(
  options: DefineParameterResolverOptions<Id, Data>,
): ParameterResolverDefinition<Id, Data> {
  return Object.freeze({
    id: createParameterResolverId(options.id),
    resolve: options.resolve,
  });
}

export class ParameterResolverRegistry {
  readonly #resolvers = new Map<ParameterResolverId, ParameterResolver>();

  register<Id extends string, Data>(definition: ParameterResolverDefinition<Id, Data>): this {
    if (this.#resolvers.has(definition.id)) {
      throw new TypeError(`Parameter resolver ID "${definition.id}" is already registered.`);
    }
    this.#resolvers.set(definition.id, definition.resolve as ParameterResolver);
    return this;
  }

  async resolve(
    resolverId: ParameterResolverId,
    request: ParameterResolutionRequest,
  ): Promise<unknown> {
    const resolver = this.#resolvers.get(resolverId);
    if (!resolver) {
      throw new UnknownParameterResolverError(resolverId);
    }
    return resolver(request);
  }
}
