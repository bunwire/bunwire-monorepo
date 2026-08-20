import {
  assertNamespacedIdentifier,
  type NamespacedIdentifier,
} from "../managed-classes/identifiers.js";

declare const methodKindIdBrand: unique symbol;
declare const parameterResolverIdBrand: unique symbol;

export type MethodKindId<Value extends string = string> = Value & {
  readonly [methodKindIdBrand]: "MethodKindId";
};

export type ParameterResolverId<Value extends string = string> = Value & {
  readonly [parameterResolverIdBrand]: "ParameterResolverId";
};

export function createMethodKindId<const Id extends NamespacedIdentifier>(
  id: Id,
): MethodKindId<Id> {
  assertNamespacedIdentifier(id, "Method-kind ID");
  return id as MethodKindId<Id>;
}

export function createParameterResolverId<const Id extends NamespacedIdentifier>(
  id: Id,
): ParameterResolverId<Id> {
  assertNamespacedIdentifier(id, "Parameter-resolver ID");
  return id as ParameterResolverId<Id>;
}
