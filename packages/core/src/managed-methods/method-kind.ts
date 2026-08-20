import type { ClassKindId, NamespacedIdentifier } from "../managed-classes/identifiers.js";
import type { ManagedClassKind } from "../managed-classes/class-kind.js";
import { createMethodKindId, type MethodKindId } from "./identifiers.js";

export interface ManagedMethodKind<Id extends string = string> {
  readonly id: MethodKindId<Id>;
  readonly allowedOn: readonly ClassKindId[];
  readonly invocable: boolean;
}

export interface ManagedMethodKindDefinition<Id extends NamespacedIdentifier> {
  readonly id: Id;
  readonly allowedOn: readonly ManagedClassKind[];
  readonly invocable: boolean;
}

export function defineMethodKind<const Id extends NamespacedIdentifier>(
  definition: ManagedMethodKindDefinition<Id>,
): ManagedMethodKind<Id> {
  const allowedOn = definition.allowedOn.map((kind) => kind.id);
  if (new Set(allowedOn).size !== allowedOn.length) {
    throw new TypeError(`Managed method kind "${definition.id}" contains duplicate allowed owning class kinds.`);
  }

  return Object.freeze({
    id: createMethodKindId(definition.id),
    allowedOn: Object.freeze(allowedOn),
    invocable: definition.invocable,
  });
}
