import {
  createClassKindId,
  type ClassKindId,
  type NamespacedIdentifier,
} from "./identifiers.js";

export interface ManagedClassKind<Id extends string = string> {
  readonly id: ClassKindId<Id>;
  readonly injectable: boolean;
  readonly autoDiscover: boolean;
  readonly analyzeConstructor: boolean;
  readonly managedMethods: boolean;
  readonly registry: boolean;
}

export interface ManagedClassKindDefinition<Id extends NamespacedIdentifier> {
  readonly id: Id;
  readonly injectable: boolean;
  readonly autoDiscover: boolean;
  readonly analyzeConstructor: boolean;
  readonly managedMethods: boolean;
  readonly registry?: boolean;
}

export function defineClassKind<const Id extends NamespacedIdentifier>(
  definition: ManagedClassKindDefinition<Id>,
): ManagedClassKind<Id> {
  return Object.freeze({
    id: createClassKindId(definition.id),
    injectable: definition.injectable,
    autoDiscover: definition.autoDiscover,
    analyzeConstructor: definition.analyzeConstructor,
    managedMethods: definition.managedMethods,
    registry: definition.registry ?? false,
  });
}
