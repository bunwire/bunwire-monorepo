import {
  assertNamespacedIdentifier,
  type NamespacedIdentifier,
} from "../managed-classes/identifiers.js";

declare const methodKindIdBrand: unique symbol;
declare const methodDecoratorIdBrand: unique symbol;
declare const parameterResolverIdBrand: unique symbol;
declare const parameterInjectorIdBrand: unique symbol;

export type MethodKindId<Value extends string = string> = Value & {
  readonly [methodKindIdBrand]: "MethodKindId";
};

export type MethodDecoratorId<Value extends string = string> = Value & {
  readonly [methodDecoratorIdBrand]: "MethodDecoratorId";
};

export type ParameterResolverId<Value extends string = string> = Value & {
  readonly [parameterResolverIdBrand]: "ParameterResolverId";
};

export type ParameterInjectorId<Value extends string = string> = Value & {
  readonly [parameterInjectorIdBrand]: "ParameterInjectorId";
};

export function createMethodKindId<const Id extends NamespacedIdentifier>(
  id: Id,
): MethodKindId<Id> {
  assertNamespacedIdentifier(id, "Method-kind ID");
  return id as MethodKindId<Id>;
}

export function createMethodDecoratorId<const Id extends NamespacedIdentifier>(
  id: Id,
): MethodDecoratorId<Id> {
  assertNamespacedIdentifier(id, "Method-decorator ID");
  return id as MethodDecoratorId<Id>;
}

export function createParameterResolverId<const Id extends NamespacedIdentifier>(
  id: Id,
): ParameterResolverId<Id> {
  assertNamespacedIdentifier(id, "Parameter-resolver ID");
  return id as ParameterResolverId<Id>;
}

export function createParameterInjectorId<const Id extends NamespacedIdentifier>(
  id: Id,
): ParameterInjectorId<Id> {
  assertNamespacedIdentifier(id, "Parameter-injector ID");
  return id as ParameterInjectorId<Id>;
}
