import type { Application } from "../application/application.js";
import type { Container } from "../container/container.js";
import type { NamespacedIdentifier } from "../managed-classes/identifiers.js";
import { isNamespacedIdentifier } from "../managed-classes/identifiers.js";
import type { ParameterResolverDefinition } from "../managed-methods/resolvers.js";
import type { ProviderConstructor } from "../application/registry.js";
import {
  assertAdapterCompilerDescriptor,
  type AdapterCompilerDescriptor,
} from "./compiler-descriptor.js";
import {
  createAdapterValidationHookId,
  type AdapterValidationHookId,
} from "./identifiers.js";
import type {
  RuntimeRegistry,
  RuntimeRegistryConsumerDefinition,
} from "./runtime-registry.js";

export interface AdapterPreparationContext {
  readonly application: Application;
  readonly rootContainer: Container;
  readonly manualContext: unknown;
  readonly hasManualContext: boolean;
}

export type NativeObjectConfigurationCallback<NativeObject> = (
  nativeObject: NativeObject,
) => void | Promise<void>;

export interface AdapterHostContext<Context = unknown> {
  readonly application: Application<Context>;
  readonly applicationContext: Context;
  readonly rootContainer: Container;
  readonly registry: RuntimeRegistry;
}

export interface AdapterValidationHookDefinition<
  Id extends string = string,
  Context = unknown,
> {
  readonly id: AdapterValidationHookId<Id>;
  readonly validate: (context: AdapterHostContext<Context>) => void | Promise<void>;
}

export interface DefineAdapterValidationHookOptions<
  Id extends NamespacedIdentifier,
  Context,
> {
  readonly id: Id;
  readonly validate: AdapterValidationHookDefinition<Id, Context>["validate"];
}

export function defineAdapterValidationHook<
  const Id extends NamespacedIdentifier,
  Context = unknown,
>(
  options: DefineAdapterValidationHookOptions<Id, Context>,
): AdapterValidationHookDefinition<Id, Context> {
  if (typeof options.validate !== "function") {
    throw new TypeError(`Adapter validation hook "${options.id}" must be callable.`);
  }
  return Object.freeze({
    id: createAdapterValidationHookId(options.id),
    validate: options.validate,
  });
}

export interface AdapterRuntimeDefinition<Context = unknown> {
  readonly providers?: readonly ProviderConstructor[];
  readonly parameterResolvers?: readonly ParameterResolverDefinition[];
  readonly registryConsumers?: readonly RuntimeRegistryConsumerDefinition<string, Context>[];
  readonly validationHooks?: readonly AdapterValidationHookDefinition<string, Context>[];
}

interface NormalizedAdapterRuntimeDefinition<Context> {
  readonly providers: readonly ProviderConstructor[];
  readonly parameterResolvers: readonly ParameterResolverDefinition[];
  readonly registryConsumers: readonly RuntimeRegistryConsumerDefinition<string, Context>[];
  readonly validationHooks: readonly AdapterValidationHookDefinition<string, Context>[];
}

interface AdapterConstructor {
  readonly compiler?: unknown;
}

function assertUniqueRuntimeIds(
  entries: readonly { readonly id: string }[],
  label: string,
): void {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry || !isNamespacedIdentifier(entry.id)) {
      throw new TypeError(`${label} contributions must be descriptor objects with namespaced IDs.`);
    }
    if (ids.has(entry.id)) {
      throw new TypeError(`${label} ID "${entry.id}" is contributed more than once.`);
    }
    ids.add(entry.id);
  }
}

export abstract class Adapter<Context = unknown> {
  readonly #runtime: NormalizedAdapterRuntimeDefinition<Context>;
  #application: Application | undefined;

  protected constructor(runtime: AdapterRuntimeDefinition<Context> = {}) {
    const providers = [...(runtime.providers ?? [])];
    const parameterResolvers = [...(runtime.parameterResolvers ?? [])];
    const registryConsumers = [...(runtime.registryConsumers ?? [])];
    const validationHooks = [...(runtime.validationHooks ?? [])];
    assertUniqueRuntimeIds(parameterResolvers, "Parameter resolver");
    assertUniqueRuntimeIds(registryConsumers, "Runtime registry-consumer");
    assertUniqueRuntimeIds(validationHooks, "Adapter validation-hook");
    for (const resolver of parameterResolvers) {
      if (typeof resolver.resolve !== "function") {
        throw new TypeError(`Parameter resolver "${resolver.id}" must be callable.`);
      }
    }
    for (const consumer of registryConsumers) {
      if (typeof consumer.consume !== "function") {
        throw new TypeError(`Runtime registry consumer "${consumer.id}" must be callable.`);
      }
    }
    for (const hook of validationHooks) {
      if (typeof hook.validate !== "function") {
        throw new TypeError(`Adapter validation hook "${hook.id}" must be callable.`);
      }
    }
    for (const provider of providers) {
      if (typeof provider !== "function") {
        throw new TypeError("Adapter Provider contributions must be constructable classes.");
      }
    }
    this.#runtime = Object.freeze({
      providers: Object.freeze(providers),
      parameterResolvers: Object.freeze(parameterResolvers),
      registryConsumers: Object.freeze(registryConsumers),
      validationHooks: Object.freeze(validationHooks),
    });
  }

  protected get application(): Application {
    if (!this.#application) {
      throw new Error("The adapter is not attached to an Application.");
    }
    return this.#application;
  }

  protected onAttach(_application: Application): void {}

  protected prepareHost(context: AdapterPreparationContext): Context | Promise<Context> {
    if (!context.hasManualContext) {
      throw new Error(
        `Adapter "${Adapter.compilerDescriptor(this).id}" requires a host context; override prepareHost() or configure the manual withContext() path.`,
      );
    }
    return context.manualContext as Context;
  }

  protected startHost(_context: AdapterHostContext<Context>): void | Promise<void> {}

  protected stopHost(_context: AdapterHostContext<Context>): void | Promise<void> {}

  static compilerDescriptor(adapter: Adapter<any>): AdapterCompilerDescriptor {
    const AdapterClass = adapter.constructor as AdapterConstructor;
    if (!Object.prototype.hasOwnProperty.call(AdapterClass, "compiler")) {
      throw new TypeError(
        `Adapter class "${adapter.constructor.name}" must declare its own static compiler descriptor.`,
      );
    }
    assertAdapterCompilerDescriptor(AdapterClass.compiler);
    return AdapterClass.compiler;
  }

  static runtimeDefinition<Context>(
    adapter: Adapter<Context>,
  ): NormalizedAdapterRuntimeDefinition<Context> {
    const compiler = Adapter.compilerDescriptor(adapter);
    const resolverIds = new Set(adapter.#runtime.parameterResolvers.map((resolver) => resolver.id));
    for (const injector of compiler.parameterInjectors) {
      if (!resolverIds.has(injector.resolverId)) {
        throw new TypeError(
          `Adapter "${compiler.id}" parameter injector "${injector.id}" requires runtime resolver "${injector.resolverId}".`,
        );
      }
    }
    return adapter.#runtime;
  }

  static attach(adapter: Adapter<any>, application: Application): void {
    if (adapter.#application) {
      throw new Error(
        `Adapter "${Adapter.compilerDescriptor(adapter).id}" is already attached to an Application.`,
      );
    }
    adapter.#application = application;
    try {
      adapter.onAttach(application);
    } catch (error) {
      adapter.#application = undefined;
      throw error;
    }
  }

  static async prepare<Context>(
    adapter: Adapter<Context>,
    context: AdapterPreparationContext,
  ): Promise<Context> {
    return adapter.prepareHost(context);
  }

  static async start<Context>(
    adapter: Adapter<Context>,
    context: AdapterHostContext<Context>,
  ): Promise<void> {
    await adapter.startHost(context);
  }

  static async stop<Context>(
    adapter: Adapter<Context>,
    context: AdapterHostContext<Context>,
  ): Promise<void> {
    await adapter.stopHost(context);
  }
}
