import type { ManagedClassDecoratorDefinition } from "../managed-classes/class-decorator.js";
import { assertClassAttachmentDefinition, type ManagedClassAttachmentDecoratorDefinition } from "../managed-classes/class-attachment.js";
import type { ManagedClassKind } from "../managed-classes/class-kind.js";
import { ManagedClassKindRegistry } from "../managed-classes/class-kind-registry.js";
import { isNamespacedIdentifier, type NamespacedIdentifier } from "../managed-classes/identifiers.js";
import type { ManagedMethodDecoratorDefinition } from "../managed-methods/method-decorator.js";
import type { ManagedMethodKind } from "../managed-methods/method-kind.js";
import { ManagedMethodKindRegistry } from "../managed-methods/method-kind-registry.js";
import type { ParameterInjectorDefinition } from "../managed-methods/parameter-injector.js";
import { assertCompilerSymbolReference } from "../compiler/compiler-symbol.js";
import type { CompilerSymbolReference } from "../compiler/compiler-symbol.js";
import type { MiddlewareClassMetadata } from "../middleware/managed-middleware.js";
import type { DefineRuntimeScheduleOptions, ScheduleExecution } from "../application/schedule.js";
import {
  createAdapterId,
  createCompilerMetadataHandlerId,
  type AdapterId,
  type CompilerMetadataHandlerId,
} from "./identifiers.js";

/** Compiler-only class policy; callbacks receive literal data, never live instances. */
export interface ManagedClassCompilationHandlerData {
  readonly type: "bunwire.managed-class-compilation";
  readonly classKindIds: readonly string[];
  readonly scope: "singleton" | "transient";
  readonly properties: readonly string[];
  readonly compileMetadata: (decoratorData: unknown, properties: Readonly<Record<string, unknown>>) => unknown;
  readonly intrinsicMethods: readonly {
    readonly name: string;
    readonly kind: ManagedMethodKind;
    readonly compilerSymbol: CompilerSymbolReference;
    readonly parameters: "payload-only" | "none" | {
      readonly resolverIds: readonly string[];
      readonly validateParameters?: (parameters: readonly {
        readonly methodIndex: number;
        readonly resolverId: string;
        readonly data: unknown;
      }[]) => void;
    };
  }[];
}

/** Compiler-only uniqueness policy across selected class kinds and supplementary metadata. */
export interface ManagedClassIdentityHandlerData {
  readonly type: "bunwire.managed-class-identity";
  readonly classKindIds: readonly string[];
  readonly reservedIdentities?: readonly string[];
  readonly resolveIdentity: (input: {
    readonly kindId: string;
    readonly name: string;
    readonly data: unknown;
    readonly attachments: readonly { readonly definitionId: string; readonly data: unknown }[];
  }) => string | undefined;
}

/** Generic compiler contract for adapter-owned scheduled targets and cadence validation. */
export interface ApplicationScheduleCompilationHandlerData {
  readonly type: "bunwire.application-schedule";
  readonly jobClassKindIds: readonly string[];
  readonly taskClassKindIds: readonly string[];
  readonly compile: (input: {
    readonly execution: ScheduleExecution;
    readonly targetName: string;
    readonly targetData: unknown;
    readonly arguments: readonly unknown[];
    readonly calls: readonly { readonly name: string; readonly arguments: readonly unknown[] }[];
    readonly generatedId: string;
  }) => Omit<DefineRuntimeScheduleOptions, "target">;
  readonly decorated: (input: {
    readonly targetName: string;
    readonly targetData: unknown;
    readonly generatedId: string;
  }) => Omit<DefineRuntimeScheduleOptions, "target"> | undefined;
}

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
  readonly classAttachments?: readonly ManagedClassAttachmentDecoratorDefinition<any, any>[];
  readonly id: AdapterId<Id>;
  readonly classKinds: readonly ManagedClassKind[];
  readonly classDecorators: readonly ManagedClassDecoratorDefinition<any, any>[];
  readonly methodKinds: readonly ManagedMethodKind[];
  readonly methodDecorators: readonly ManagedMethodDecoratorDefinition<any, any>[];
  readonly parameterInjectors: readonly ParameterInjectorDefinition<any, any>[];
  readonly middlewareDefinitions?: readonly AdapterCompilerMiddlewareDefinition[];
  readonly metadataHandlers: readonly CompilerMetadataHandlerDescriptor[];
}

export interface AdapterCompilerMiddlewareDefinition {
  readonly compilerSymbol: CompilerSymbolReference;
  readonly data: MiddlewareClassMetadata;
}

export interface DefineAdapterCompilerDescriptorOptions<Id extends NamespacedIdentifier> {
  readonly classAttachments?: readonly ManagedClassAttachmentDecoratorDefinition<any, any>[];
  readonly id: Id;
  readonly classKinds?: readonly ManagedClassKind[];
  readonly classDecorators?: readonly ManagedClassDecoratorDefinition<any, any>[];
  readonly methodKinds?: readonly ManagedMethodKind[];
  readonly methodDecorators?: readonly ManagedMethodDecoratorDefinition<any, any>[];
  readonly parameterInjectors?: readonly ParameterInjectorDefinition<any, any>[];
  readonly middlewareDefinitions?: readonly AdapterCompilerMiddlewareDefinition[];
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
  const middlewareDefinitions = [...(options.middlewareDefinitions ?? [])];
  const metadataHandlers = [...(options.metadataHandlers ?? [])];
  const classAttachments = [...(options.classAttachments ?? [])];

  assertUniqueIds(classKinds, "Managed class-kind");
  assertUniqueIds(classDecorators, "Managed class-decorator");
  assertUniqueIds(methodKinds, "Managed method-kind");
  assertUniqueIds(methodDecorators, "Managed method-decorator");
  assertUniqueIds(parameterInjectors, "Parameter-injector");
  assertMiddlewareDefinitions(middlewareDefinitions);
  assertUniqueIds(metadataHandlers, "Compiler metadata-handler");

  const classKindById = new Map(classKinds.map((kind) => [kind.id, kind]));
  for (const decorator of classDecorators) {
    assertCompilerSymbolReference(decorator.compilerSymbol, `Managed class decorator "${decorator.id}"`);
    if (classKindById.get(decorator.kind.id) !== decorator.kind) {
      throw new TypeError(
        `Managed class decorator "${decorator.id}" must reference its canonical contributed class-kind descriptor "${decorator.kind.id}".`,
      );
    }
  }

  const methodKindById = new Map(methodKinds.map((kind) => [kind.id, kind]));
  for (const decorator of methodDecorators) {
    assertCompilerSymbolReference(decorator.compilerSymbol, `Managed method decorator "${decorator.id}"`);
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
    middlewareDefinitions: Object.freeze(middlewareDefinitions),
    metadataHandlers: Object.freeze(metadataHandlers),
    classAttachments: Object.freeze(classAttachments),
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
    || (candidate.middlewareDefinitions !== undefined && !Array.isArray(candidate.middlewareDefinitions))
    || (candidate.classAttachments !== undefined && !Array.isArray(candidate.classAttachments))
    || !Array.isArray(candidate.metadataHandlers)) {
    throw new TypeError("Adapter compiler descriptors are malformed; use defineAdapterCompilerDescriptor().");
  }

  const classKinds = candidate.classKinds as readonly ManagedClassKind[];
  const classDecorators = candidate.classDecorators as readonly ManagedClassDecoratorDefinition<any, any>[];
  const methodKinds = candidate.methodKinds as readonly ManagedMethodKind[];
  const methodDecorators = candidate.methodDecorators as readonly ManagedMethodDecoratorDefinition<any, any>[];
  const parameterInjectors = candidate.parameterInjectors as readonly ParameterInjectorDefinition<any, any>[];
  const middlewareDefinitions = candidate.middlewareDefinitions ?? [];
  const metadataHandlers = candidate.metadataHandlers as readonly CompilerMetadataHandlerDescriptor[];
  const classRegistry = new ManagedClassKindRegistry(classKinds);
  assertUniqueIds(candidate.classAttachments ?? [], "Managed class-attachment");
  for (const definition of candidate.classAttachments ?? []) assertClassAttachmentDefinition(definition);
  const methodRegistry = new ManagedMethodKindRegistry(methodKinds);
  managedClassCompilationHandlers(candidate as AdapterCompilerDescriptor);
  assertUniqueIds(classKinds, "Managed class-kind");
  assertUniqueIds(classDecorators, "Managed class-decorator");
  assertUniqueIds(methodKinds, "Managed method-kind");
  assertUniqueIds(methodDecorators, "Managed method-decorator");
  assertUniqueIds(parameterInjectors, "Parameter-injector");
  assertMiddlewareDefinitions(middlewareDefinitions);
  assertUniqueIds(metadataHandlers, "Compiler metadata-handler");

  for (const decorator of classDecorators) {
    assertCompilerSymbolReference(decorator.compilerSymbol, `Managed class decorator "${decorator.id}"`);
    if (typeof decorator.createMetadata !== "function"
      || classRegistry.get(decorator.kind?.id) !== decorator.kind) {
      throw new TypeError(
        `Managed class decorator "${decorator.id}" must reference a canonical contributed class kind and callable metadata factory.`,
      );
    }
  }
  for (const decorator of methodDecorators) {
    assertCompilerSymbolReference(decorator.compilerSymbol, `Managed method decorator "${decorator.id}"`);
    if (typeof decorator.createMetadata !== "function"
      || methodRegistry.get(decorator.kind?.id) !== decorator.kind) {
      throw new TypeError(
        `Managed method decorator "${decorator.id}" must reference a canonical contributed method kind and callable metadata factory.`,
      );
    }
  }
  for (const injector of parameterInjectors) {
    assertCompilerSymbolReference(injector.compilerSymbol, `Parameter injector "${injector.id}"`);
    if (!isNamespacedIdentifier(injector.resolverId)
      || typeof injector.createMetadata !== "function") {
      throw new TypeError(
        `Parameter injector "${injector.id}" must reference a namespaced resolver ID and callable metadata factory.`,
      );
    }
  }
}

/** Internal shared validation used at descriptor attachment and registry authorization. */
export function managedClassCompilationHandlers(descriptor: AdapterCompilerDescriptor): ReadonlyMap<string, ManagedClassCompilationHandlerData> {
  const result = new Map<string, ManagedClassCompilationHandlerData>();
  for (const handler of descriptor.metadataHandlers) {
    if (!handler?.data || typeof handler.data !== "object" || !("type" in handler.data) || handler.data.type !== "bunwire.managed-class-compilation") continue;
    const data = handler.data as ManagedClassCompilationHandlerData;
    if (!Array.isArray(data.classKindIds) || data.classKindIds.length === 0 || !Array.isArray(data.properties)
      || data.properties.some((key) => typeof key !== "string" || !key) || new Set(data.properties).size !== data.properties.length
      || !["singleton", "transient"].includes(data.scope) || typeof data.compileMetadata !== "function" || !Array.isArray(data.intrinsicMethods)) {
      throw new TypeError(`Malformed class compilation handler "${handler.id}".`);
    }
    for (const kindId of data.classKindIds) {
      if (result.has(kindId) || !descriptor.classDecorators.some((entry) => entry.kind.id === kindId)) throw new TypeError(`Duplicate or unregistered class compilation kind "${kindId}".`);
      const names = new Set<string>();
      for (const method of data.intrinsicMethods) {
        const resolverPolicy = typeof method?.parameters === "object" && method.parameters !== null
          ? method.parameters as { readonly resolverIds?: unknown }
          : undefined;
        if (!method || typeof method.name !== "string" || !method.name || names.has(method.name)
          || (method.parameters !== "payload-only" && method.parameters !== "none"
            && (!resolverPolicy || !Array.isArray(resolverPolicy.resolverIds) || resolverPolicy.resolverIds.length === 0
              || resolverPolicy.resolverIds.some((id) => !isNamespacedIdentifier(id))
              || new Set(resolverPolicy.resolverIds).size !== resolverPolicy.resolverIds.length
              || ("validateParameters" in resolverPolicy && resolverPolicy.validateParameters !== undefined && typeof resolverPolicy.validateParameters !== "function")))
          || !descriptor.methodKinds.includes(method.kind) || !method.kind.allowedOn.some((id: string) => id === kindId)) throw new TypeError(`Invalid intrinsic method in "${handler.id}".`);
        assertCompilerSymbolReference(method.compilerSymbol, "Intrinsic method kind");
        names.add(method.name);
      }
      result.set(kindId, data);
    }
  }
  return result;
}

function assertMiddlewareDefinitions(definitions: readonly AdapterCompilerMiddlewareDefinition[]): void {
  const symbols = new Set<string>();
  const aliases = new Set<string>();
  for (const definition of definitions) {
    if (!definition || typeof definition !== "object") {
      throw new TypeError("Compiler middleware definitions must be descriptor objects.");
    }
    assertCompilerSymbolReference(definition.compilerSymbol, "Compiler middleware definition");
    const key = `${definition.compilerSymbol.moduleSpecifier}\0${definition.compilerSymbol.exportName}`;
    if (symbols.has(key)) throw new TypeError(`Compiler middleware symbol "${definition.compilerSymbol.exportName}" is contributed more than once.`);
    symbols.add(key);
    const data = definition.data;
    if (!data || typeof data !== "object" || data.scope !== "transient") {
      throw new TypeError("Compiler middleware definitions must declare transient middleware metadata.");
    }
    if (data.alias !== undefined) {
      if (typeof data.alias !== "string" || data.alias.trim().length === 0) throw new TypeError("Compiler middleware aliases must be non-empty strings.");
      if (aliases.has(data.alias)) throw new TypeError(`Compiler middleware alias "${data.alias}" is contributed more than once.`);
      aliases.add(data.alias);
    }
  }
}
