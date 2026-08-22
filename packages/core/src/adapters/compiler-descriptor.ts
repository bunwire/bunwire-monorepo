import type { ManagedClassDecoratorDefinition } from "../managed-classes/class-decorator.js";
import type { ManagedClassKind } from "../managed-classes/class-kind.js";
import { ManagedClassKindRegistry } from "../managed-classes/class-kind-registry.js";
import { isNamespacedIdentifier, type NamespacedIdentifier } from "../managed-classes/identifiers.js";
import type { ManagedMethodDecoratorDefinition } from "../managed-methods/method-decorator.js";
import type { ManagedMethodKind } from "../managed-methods/method-kind.js";
import { ManagedMethodKindRegistry } from "../managed-methods/method-kind-registry.js";
import type { ParameterInjectorDefinition } from "../managed-methods/parameter-injector.js";
import {
  createAdapterId,
  createCompilerMetadataHandlerId,
  type AdapterId,
  type CompilerMetadataHandlerId,
} from "./identifiers.js";

export interface CompilerMetadataHandlerDescriptor<
  Id extends string = string,
  Data = unknown,
> {
  readonly id: CompilerMetadataHandlerId<Id>;
  readonly data: Data;
}

export interface DefineCompilerMetadataHandlerOptions<
  Id extends NamespacedIdentifier,
  Data,
> {
  readonly id: Id;
  readonly data: Data;
}

export function defineCompilerMetadataHandler<
  const Id extends NamespacedIdentifier,
  Data,
>(
  options: DefineCompilerMetadataHandlerOptions<Id, Data>,
): CompilerMetadataHandlerDescriptor<Id, Data> {
  return Object.freeze({
    id: createCompilerMetadataHandlerId(options.id),
    data: options.data,
  });
}

export interface AdapterCompilerDescriptor<Id extends string = string> {
  readonly id: AdapterId<Id>;
  readonly classKinds: readonly ManagedClassKind[];
  readonly classDecorators: readonly ManagedClassDecoratorDefinition<any, any>[];
  readonly methodKinds: readonly ManagedMethodKind[];
  readonly methodDecorators: readonly ManagedMethodDecoratorDefinition<any, any>[];
  readonly parameterInjectors: readonly ParameterInjectorDefinition<any, any>[];
  readonly metadataHandlers: readonly CompilerMetadataHandlerDescriptor[];
}

export interface DefineAdapterCompilerDescriptorOptions<Id extends NamespacedIdentifier> {
  readonly id: Id;
  readonly classKinds?: readonly ManagedClassKind[];
  readonly classDecorators?: readonly ManagedClassDecoratorDefinition<any, any>[];
  readonly methodKinds?: readonly ManagedMethodKind[];
  readonly methodDecorators?: readonly ManagedMethodDecoratorDefinition<any, any>[];
  readonly parameterInjectors?: readonly ParameterInjectorDefinition<any, any>[];
  readonly metadataHandlers?: readonly CompilerMetadataHandlerDescriptor[];
}

function assertUniqueIds(
  entries: readonly { readonly id: string }[],
  label: string,
): void {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry || !isNamespacedIdentifier(entry.id)) {
      throw new TypeError(`${label} entries must declare stable namespaced IDs.`);
    }
    if (ids.has(entry.id)) {
      throw new TypeError(`${label} ID "${entry.id}" is contributed more than once.`);
    }
    ids.add(entry.id);
  }
}

export function defineAdapterCompilerDescriptor<const Id extends NamespacedIdentifier>(
  options: DefineAdapterCompilerDescriptorOptions<Id>,
): AdapterCompilerDescriptor<Id> {
  const classKinds = [...(options.classKinds ?? [])];
  const classDecorators = [...(options.classDecorators ?? [])];
  const methodKinds = [...(options.methodKinds ?? [])];
  const methodDecorators = [...(options.methodDecorators ?? [])];
  const parameterInjectors = [...(options.parameterInjectors ?? [])];
  const metadataHandlers = [...(options.metadataHandlers ?? [])];

  assertUniqueIds(classKinds, "Managed class-kind");
  assertUniqueIds(classDecorators, "Managed class-decorator");
  assertUniqueIds(methodKinds, "Managed method-kind");
  assertUniqueIds(methodDecorators, "Managed method-decorator");
  assertUniqueIds(parameterInjectors, "Parameter-injector");
  assertUniqueIds(metadataHandlers, "Compiler metadata-handler");

  const classKindById = new Map(classKinds.map((kind) => [kind.id, kind]));
  for (const decorator of classDecorators) {
    if (classKindById.get(decorator.kind.id) !== decorator.kind) {
      throw new TypeError(
        `Managed class decorator "${decorator.id}" must reference its canonical contributed class-kind descriptor "${decorator.kind.id}".`,
      );
    }
  }

  const methodKindById = new Map(methodKinds.map((kind) => [kind.id, kind]));
  for (const decorator of methodDecorators) {
    if (methodKindById.get(decorator.kind.id) !== decorator.kind) {
      throw new TypeError(
        `Managed method decorator "${decorator.id}" must reference its canonical contributed method-kind descriptor "${decorator.kind.id}".`,
      );
    }
  }

  const descriptor = Object.freeze({
    id: createAdapterId(options.id),
    classKinds: Object.freeze(classKinds),
    classDecorators: Object.freeze(classDecorators),
    methodKinds: Object.freeze(methodKinds),
    methodDecorators: Object.freeze(methodDecorators),
    parameterInjectors: Object.freeze(parameterInjectors),
    metadataHandlers: Object.freeze(metadataHandlers),
  });
  assertAdapterCompilerDescriptor(descriptor);
  return descriptor;
}

export function assertAdapterCompilerDescriptor(
  descriptor: unknown,
): asserts descriptor is AdapterCompilerDescriptor {
  if (typeof descriptor !== "object" || descriptor === null) {
    throw new TypeError("Adapter classes must expose a static compiler descriptor object.");
  }
  const candidate = descriptor as Partial<AdapterCompilerDescriptor>;
  if (!isNamespacedIdentifier(candidate.id)
    || !Array.isArray(candidate.classKinds)
    || !Array.isArray(candidate.classDecorators)
    || !Array.isArray(candidate.methodKinds)
    || !Array.isArray(candidate.methodDecorators)
    || !Array.isArray(candidate.parameterInjectors)
    || !Array.isArray(candidate.metadataHandlers)) {
    throw new TypeError("Adapter compiler descriptors are malformed; use defineAdapterCompilerDescriptor().");
  }

  const classKinds = candidate.classKinds as readonly ManagedClassKind[];
  const classDecorators = candidate.classDecorators as readonly ManagedClassDecoratorDefinition<any, any>[];
  const methodKinds = candidate.methodKinds as readonly ManagedMethodKind[];
  const methodDecorators = candidate.methodDecorators as readonly ManagedMethodDecoratorDefinition<any, any>[];
  const parameterInjectors = candidate.parameterInjectors as readonly ParameterInjectorDefinition<any, any>[];
  const metadataHandlers = candidate.metadataHandlers as readonly CompilerMetadataHandlerDescriptor[];
  const classRegistry = new ManagedClassKindRegistry(classKinds);
  const methodRegistry = new ManagedMethodKindRegistry(methodKinds);
  assertUniqueIds(classKinds, "Managed class-kind");
  assertUniqueIds(classDecorators, "Managed class-decorator");
  assertUniqueIds(methodKinds, "Managed method-kind");
  assertUniqueIds(methodDecorators, "Managed method-decorator");
  assertUniqueIds(parameterInjectors, "Parameter-injector");
  assertUniqueIds(metadataHandlers, "Compiler metadata-handler");

  for (const decorator of classDecorators) {
    if (typeof decorator.createMetadata !== "function"
      || classRegistry.get(decorator.kind?.id) !== decorator.kind) {
      throw new TypeError(
        `Managed class decorator "${decorator.id}" must reference a canonical contributed class kind and callable metadata factory.`,
      );
    }
  }
  for (const decorator of methodDecorators) {
    if (typeof decorator.createMetadata !== "function"
      || methodRegistry.get(decorator.kind?.id) !== decorator.kind) {
      throw new TypeError(
        `Managed method decorator "${decorator.id}" must reference a canonical contributed method kind and callable metadata factory.`,
      );
    }
  }
  for (const injector of parameterInjectors) {
    if (!isNamespacedIdentifier(injector.resolverId)
      || typeof injector.createMetadata !== "function") {
      throw new TypeError(
        `Parameter injector "${injector.id}" must reference a namespaced resolver ID and callable metadata factory.`,
      );
    }
  }
}
