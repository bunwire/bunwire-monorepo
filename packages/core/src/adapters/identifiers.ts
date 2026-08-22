import {
  assertNamespacedIdentifier,
  type NamespacedIdentifier,
} from "../managed-classes/identifiers.js";

declare const adapterIdBrand: unique symbol;
declare const registryConsumerIdBrand: unique symbol;
declare const validationHookIdBrand: unique symbol;
declare const compilerMetadataHandlerIdBrand: unique symbol;

export type AdapterId<Value extends string = string> = Value & {
  readonly [adapterIdBrand]: "AdapterId";
};

export type RegistryConsumerId<Value extends string = string> = Value & {
  readonly [registryConsumerIdBrand]: "RegistryConsumerId";
};

export type AdapterValidationHookId<Value extends string = string> = Value & {
  readonly [validationHookIdBrand]: "AdapterValidationHookId";
};

export type CompilerMetadataHandlerId<Value extends string = string> = Value & {
  readonly [compilerMetadataHandlerIdBrand]: "CompilerMetadataHandlerId";
};

export function createAdapterId<const Id extends NamespacedIdentifier>(id: Id): AdapterId<Id> {
  assertNamespacedIdentifier(id, "Adapter ID");
  return id as AdapterId<Id>;
}

export function createRegistryConsumerId<const Id extends NamespacedIdentifier>(
  id: Id,
): RegistryConsumerId<Id> {
  assertNamespacedIdentifier(id, "Runtime registry-consumer ID");
  return id as RegistryConsumerId<Id>;
}

export function createAdapterValidationHookId<const Id extends NamespacedIdentifier>(
  id: Id,
): AdapterValidationHookId<Id> {
  assertNamespacedIdentifier(id, "Adapter validation-hook ID");
  return id as AdapterValidationHookId<Id>;
}

export function createCompilerMetadataHandlerId<const Id extends NamespacedIdentifier>(
  id: Id,
): CompilerMetadataHandlerId<Id> {
  assertNamespacedIdentifier(id, "Compiler metadata-handler ID");
  return id as CompilerMetadataHandlerId<Id>;
}
