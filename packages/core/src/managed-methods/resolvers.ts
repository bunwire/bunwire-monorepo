import type { InvocationContext } from "../application/invocation-context.js";
import { UnknownParameterResolverError } from "./errors.js";
import {
  createParameterResolverId,
  type ParameterResolverId,
} from "./identifiers.js";
import type { ManagedMethodPlan, ResolverParameterPlan } from "./plan.js";
import type { NamespacedIdentifier } from "../managed-classes/identifiers.js";
import { isNamespacedIdentifier } from "../managed-classes/identifiers.js";

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
  readonly #resolvers = new Map<ParameterResolverId, ParameterResolverDefinition>();

  register<Id extends string, Data>(definition: ParameterResolverDefinition<Id, Data>): this {
    if (!definition || typeof definition !== "object"
      || !isNamespacedIdentifier(definition.id)
      || typeof definition.resolve !== "function") {
      throw new TypeError(
        "Parameter resolver descriptors are malformed; use defineParameterResolver().",
      );
    }
    const existing = this.#resolvers.get(definition.id);
    if (existing === definition) {
      return this;
    }
    if (existing) {
      throw new TypeError(
        `Parameter resolver ID "${definition.id}" is already registered with a different descriptor.`,
      );
    }
    this.#resolvers.set(definition.id, definition as ParameterResolverDefinition);
    return this;
  }

  get(id: ParameterResolverId): ParameterResolverDefinition | undefined {
    return this.#resolvers.get(id);
  }

  async resolve(
    resolverId: ParameterResolverId,
    request: ParameterResolutionRequest,
  ): Promise<unknown> {
    const definition = this.#resolvers.get(resolverId);
    if (!definition) {
      throw new UnknownParameterResolverError(resolverId);
    }
    return definition.resolve(request);
  }
}
