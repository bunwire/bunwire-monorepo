import {
  CONTROLLER_KIND,
  Controller,
  EVENT_KIND,
  Event,
  LISTENER_KIND,
  Listener,
  MIDDLEWARE_KIND,
  Middleware,
  ManagedClassKindRegistry,
  ManagedMethodKindRegistry,
  PROVIDER_KIND,
  Provider,
  SERVICE_KIND,
  Service,
  assertAdapterCompilerDescriptor,
  type AdapterCompilerDescriptor,
  type CompilerSymbolReference,
  type CompilerMetadataHandlerDescriptor,
  type ManagedClassDecoratorDefinition,
  type ManagedClassKind,
  type ManagedMethodDecoratorDefinition,
  type ManagedMethodKind,
  type ParameterInjectorDefinition,
} from "@bunwire/core";
import { BunwireCompilerError } from "./diagnostics.js";

export interface DiscoveredCompilerExtensions {
  readonly adapter: AdapterCompilerDescriptor;
  readonly classKinds: readonly ManagedClassKind[];
  readonly classDecorators: readonly ManagedClassDecoratorDefinition<any, any>[];
  readonly methodKinds: readonly ManagedMethodKind[];
  readonly methodDecorators: readonly ManagedMethodDecoratorDefinition<any, any>[];
  readonly parameterInjectors: readonly ParameterInjectorDefinition<any, any>[];
  readonly metadataHandlers: readonly CompilerMetadataHandlerDescriptor[];
}

function compareIds(left: { readonly id: string }, right: { readonly id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function registerIdentity<T extends { readonly id: string }>(
  registry: Map<string, T>,
  definition: T,
  label: string,
): void {
  const existing = registry.get(definition.id);
  if (existing === definition) {
    return;
  }
  if (existing) {
    throw new BunwireCompilerError(
      "EXTENSION_CONFLICT",
      `${label} ID "${definition.id}" is already registered with a different compiler descriptor.`,
    );
  }
  registry.set(definition.id, definition);
}

function compilerSymbolKey(reference: CompilerSymbolReference): string {
  return `${reference.moduleSpecifier}\0${reference.exportName}`;
}

export function aggregateCompilerExtensions(
  adapter: AdapterCompilerDescriptor,
): DiscoveredCompilerExtensions {
  try {
    assertAdapterCompilerDescriptor(adapter);
  } catch (cause) {
    throw new BunwireCompilerError(
      "EXTENSION_CONFLICT",
      `Adapter compiler extensions are malformed: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
  const classKinds = new ManagedClassKindRegistry([
    SERVICE_KIND,
    CONTROLLER_KIND,
    PROVIDER_KIND,
    MIDDLEWARE_KIND,
    EVENT_KIND,
    LISTENER_KIND,
  ]);
  const methodKinds = new ManagedMethodKindRegistry();
  const classDecorators = new Map<string, ManagedClassDecoratorDefinition<any, any>>();
  const methodDecorators = new Map<string, ManagedMethodDecoratorDefinition<any, any>>();
  const parameterInjectors = new Map<string, ParameterInjectorDefinition<any, any>>();
  const metadataHandlers = new Map<string, CompilerMetadataHandlerDescriptor>();
  const compilerSymbols = new Map<string, { readonly id: string }>();

  const registerCompilerSymbol = (definition: {
    readonly id: string;
    readonly compilerSymbol: CompilerSymbolReference;
  }): void => {
    const key = compilerSymbolKey(definition.compilerSymbol);
    const existing = compilerSymbols.get(key);
    if (existing && existing !== definition) {
      throw new BunwireCompilerError(
        "EXTENSION_CONFLICT",
        `Compiler symbol "${definition.compilerSymbol.moduleSpecifier}" export "${definition.compilerSymbol.exportName}" is assigned to both "${existing.id}" and "${definition.id}".`,
      );
    }
    compilerSymbols.set(key, definition);
  };

  registerIdentity(classDecorators, Service.definition, "Managed class-decorator");
  registerIdentity(classDecorators, Controller.definition, "Managed class-decorator");
  registerIdentity(classDecorators, Provider.definition, "Managed class-decorator");
  registerIdentity(classDecorators, Middleware.definition, "Managed class-decorator");
  registerIdentity(classDecorators, Event.definition, "Managed class-decorator");
  registerIdentity(classDecorators, Listener.definition, "Managed class-decorator");
  registerCompilerSymbol(Service.definition);
  registerCompilerSymbol(Controller.definition);
  registerCompilerSymbol(Provider.definition);
  registerCompilerSymbol(Middleware.definition);
  registerCompilerSymbol(Event.definition);
  registerCompilerSymbol(Listener.definition);

  try {
    for (const kind of adapter.classKinds) {
      classKinds.register(kind);
    }
    for (const kind of adapter.methodKinds) {
      methodKinds.register(kind);
    }
  } catch (cause) {
    throw new BunwireCompilerError(
      "EXTENSION_CONFLICT",
      `Adapter "${adapter.id}" contributes conflicting class/method kind identities: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }

  for (const kind of adapter.methodKinds) {
    for (const ownerId of kind.allowedOn) {
      const owner = classKinds.get(ownerId);
      if (!owner) {
        throw new BunwireCompilerError(
          "EXTENSION_CONFLICT",
          `Adapter method kind "${kind.id}" references unknown owning class kind "${ownerId}".`,
        );
      }
      if (!owner.managedMethods) {
        throw new BunwireCompilerError(
          "EXTENSION_CONFLICT",
          `Adapter method kind "${kind.id}" cannot target class kind "${ownerId}" because it does not allow managed methods.`,
        );
      }
    }
  }

  for (const definition of adapter.classDecorators) {
    if (classKinds.get(definition.kind.id) !== definition.kind) {
      throw new BunwireCompilerError(
        "EXTENSION_CONFLICT",
        `Managed class decorator "${definition.id}" does not use canonical class kind "${definition.kind.id}".`,
      );
    }
    registerIdentity(classDecorators, definition, "Managed class-decorator");
    registerCompilerSymbol(definition);
  }
  for (const definition of adapter.methodDecorators) {
    if (methodKinds.get(definition.kind.id) !== definition.kind) {
      throw new BunwireCompilerError(
        "EXTENSION_CONFLICT",
        `Managed method decorator "${definition.id}" does not use canonical method kind "${definition.kind.id}".`,
      );
    }
    registerIdentity(methodDecorators, definition, "Managed method-decorator");
    registerCompilerSymbol(definition);
  }
  for (const definition of adapter.parameterInjectors) {
    registerIdentity(parameterInjectors, definition, "Parameter-injector");
    registerCompilerSymbol(definition);
  }
  for (const definition of adapter.metadataHandlers) {
    registerIdentity(metadataHandlers, definition, "Compiler metadata-handler");
  }

  const registeredClassKinds: ManagedClassKind[] = [
    SERVICE_KIND,
    CONTROLLER_KIND,
    PROVIDER_KIND,
    MIDDLEWARE_KIND,
    EVENT_KIND,
    LISTENER_KIND,
  ];
  for (const kind of adapter.classKinds) {
    if (!registeredClassKinds.includes(kind)) {
      registeredClassKinds.push(kind);
    }
  }

  return Object.freeze({
    adapter,
    classKinds: Object.freeze(registeredClassKinds.sort(compareIds)),
    classDecorators: Object.freeze([...classDecorators.values()].sort(compareIds)),
    methodKinds: Object.freeze([...adapter.methodKinds].sort(compareIds)),
    methodDecorators: Object.freeze([...methodDecorators.values()].sort(compareIds)),
    parameterInjectors: Object.freeze([...parameterInjectors.values()].sort(compareIds)),
    metadataHandlers: Object.freeze([...metadataHandlers.values()].sort(compareIds)),
  });
}
