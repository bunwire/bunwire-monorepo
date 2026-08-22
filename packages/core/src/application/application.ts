import { Container } from "../container/container.js";
import { Adapter, type AdapterHostContext } from "../adapters/adapter.js";
import {
  defineRuntimeRegistry,
  type RuntimeRegistry,
  type RuntimeRegistryConsumerContext,
} from "../adapters/runtime-registry.js";
import { PROVIDER_KIND } from "../managed-classes/built-ins.js";
import type { ManagedClassKind } from "../managed-classes/class-kind.js";
import { getManagedClassMetadata } from "../managed-classes/metadata.js";
import { InvocationEngine, type InvocationResult } from "../managed-methods/invocation-engine.js";
import { getManagedMethodMetadata } from "../managed-methods/method-decorator.js";
import type { ManagedMethodPlan } from "../managed-methods/plan.js";
import type { ManagedMethodKind } from "../managed-methods/method-kind.js";
import type { ParameterResolverDefinition } from "../managed-methods/resolvers.js";
import { ApplicationStateError } from "./errors.js";
import {
  APPLICATION_CONTEXT,
  INVOCATION_CONTEXT,
  type InvocationContext,
  type ManagedInvocationOptions,
} from "./invocation-context.js";
import type {
  ConventionRegistration,
  ProviderConstructor,
  ProviderLifecycle,
  ProviderRegistry,
} from "./registry.js";

export type ApplicationState = "configuring" | "starting" | "running" | "failed";

export class Application<ApplicationContext = unknown> {
  readonly #providerClasses: ProviderConstructor[] = [];
  readonly #conventionRegistrations: ConventionRegistration[] = [];
  #state: ApplicationState = "configuring";
  #configuredContext: unknown;
  #hasConfiguredContext = false;
  #applicationContext: unknown;
  #hasApplicationContext = false;
  #rootContainer: Container | undefined;
  #providerInstances: readonly ProviderLifecycle[] = Object.freeze([]);
  #nextInvocationId = 1;
  readonly #invocationEngine = new InvocationEngine();
  #adapter: Adapter<any> | undefined;
  #runtimeRegistry: RuntimeRegistry = defineRuntimeRegistry();

  get state(): ApplicationState {
    return this.#state;
  }

  get isRunning(): boolean {
    return this.#state === "running";
  }

  get rootContainer(): Container {
    if (!this.#rootContainer) {
      throw new ApplicationStateError(
        "The Application root container is unavailable before start() creates it.",
      );
    }
    return this.#rootContainer;
  }

  withContext<NextContext>(context: NextContext): Application<NextContext> {
    this.assertConfiguring("withContext()");
    this.#configuredContext = context;
    this.#hasConfiguredContext = true;
    return this as unknown as Application<NextContext>;
  }

  withProviderRegistry(registry: ProviderRegistry): this {
    this.assertConfiguring("withProviderRegistry()");
    this.#providerClasses.push(...registry.providers);
    return this;
  }

  withAdapter<AdapterContext>(adapter: Adapter<AdapterContext>): Application<AdapterContext> {
    this.assertConfiguring("withAdapter()");
    if (!(adapter instanceof Adapter)) {
      throw new TypeError("withAdapter() requires an instance of a class extending Adapter.");
    }
    if (this.#adapter) {
      throw new ApplicationStateError(
        `Application.withAdapter() supports one primary host adapter in v1; adapter "${Adapter.compilerDescriptor(this.#adapter).id}" is already attached.`,
      );
    }

    const compiler = Adapter.compilerDescriptor(adapter);
    const runtime = Adapter.runtimeDefinition(adapter);
    for (const kind of compiler.classKinds) {
      const existing = this.#invocationEngine.getClassKind(kind.id);
      if (existing && existing !== kind) {
        throw new TypeError(
          `Managed class kind ID "${kind.id}" is already registered with a different descriptor.`,
        );
      }
    }
    for (const kind of compiler.methodKinds) {
      const existing = this.#invocationEngine.getMethodKind(kind.id);
      if (existing && existing !== kind) {
        throw new TypeError(
          `Managed method kind ID "${kind.id}" is already registered with a different descriptor.`,
        );
      }
    }
    for (const resolver of runtime.parameterResolvers) {
      const existing = this.#invocationEngine.getResolver(resolver.id);
      if (existing && existing !== resolver) {
        throw new TypeError(
          `Parameter resolver ID "${resolver.id}" is already registered with a different descriptor.`,
        );
      }
    }
    const contributedClassKinds = new Map(
      compiler.classKinds.map((kind) => [kind.id, kind]),
    );
    for (const kind of compiler.methodKinds) {
      for (const ownerId of kind.allowedOn) {
        const owner = contributedClassKinds.get(ownerId)
          ?? this.#invocationEngine.getClassKind(ownerId);
        if (!owner) {
          throw new TypeError(
            `Adapter "${compiler.id}" method kind "${kind.id}" references unregistered owning class kind "${ownerId}".`,
          );
        }
        if (!owner.managedMethods) {
          throw new TypeError(
            `Adapter "${compiler.id}" method kind "${kind.id}" cannot target class kind "${ownerId}" because it does not allow managed methods.`,
          );
        }
      }
    }

    Adapter.attach(adapter, this);
    for (const kind of compiler.classKinds) {
      this.#invocationEngine.registerClassKind(kind);
    }
    for (const kind of compiler.methodKinds) {
      this.#invocationEngine.registerMethodKind(kind);
    }
    for (const resolver of runtime.parameterResolvers) {
      this.#invocationEngine.registerResolver(resolver);
    }
    this.#providerClasses.push(...runtime.providers);
    this.#adapter = adapter;
    return this as unknown as Application<AdapterContext>;
  }

  withProviders(...providers: readonly ProviderConstructor[]): this {
    this.assertConfiguring("withProviders()");
    this.#providerClasses.push(...providers);
    return this;
  }

  withConventionBindings(registration: ConventionRegistration): this {
    this.assertConfiguring("withConventionBindings()");
    this.#conventionRegistrations.push(registration);
    return this;
  }

  withParameterResolver<Id extends string, Data>(
    definition: ParameterResolverDefinition<Id, Data>,
  ): this {
    this.assertConfiguring("withParameterResolver()");
    this.#invocationEngine.registerResolver(definition);
    return this;
  }

  withManagedMethodKind(kind: ManagedMethodKind): this {
    this.assertConfiguring("withManagedMethodKind()");
    this.#invocationEngine.registerMethodKind(kind);
    return this;
  }

  withManagedClassKind(kind: ManagedClassKind): this {
    this.assertConfiguring("withManagedClassKind()");
    this.#invocationEngine.registerClassKind(kind);
    return this;
  }

  withRuntimeRegistry(registry: RuntimeRegistry): this {
    this.assertConfiguring("withRuntimeRegistry()");
    this.#runtimeRegistry = registry;
    return this;
  }

  async start(): Promise<void> {
    if (this.#state !== "configuring") {
      throw new ApplicationStateError(
        `Application.start() can only be called once; current state is "${this.#state}".`,
      );
    }

    this.#state = "starting";
    const rootContainer = new Container();
    this.#rootContainer = rootContainer;

    try {
      for (const registration of this.#conventionRegistrations) {
        await registration(rootContainer);
      }

      if (this.#adapter) {
        this.#applicationContext = await Adapter.prepare(this.#adapter, {
          application: this,
          rootContainer,
          manualContext: this.#configuredContext,
          hasManualContext: this.#hasConfiguredContext,
        });
        this.#hasApplicationContext = true;
      } else if (this.#hasConfiguredContext) {
        this.#applicationContext = this.#configuredContext;
        this.#hasApplicationContext = true;
      }

      if (this.#hasApplicationContext) {
        rootContainer.value(APPLICATION_CONTEXT, this.#applicationContext);
      }

      this.validateRuntimeRegistry(this.#runtimeRegistry);

      const adapterRuntime = this.#adapter
        ? Adapter.runtimeDefinition(this.#adapter)
        : undefined;
      if (this.#adapter && adapterRuntime) {
        const hostContext = this.createAdapterHostContext(
          this.#adapter,
          rootContainer,
          this.#runtimeRegistry,
        );
        for (const hook of adapterRuntime.validationHooks) {
          await hook.validate(hostContext);
        }
      }

      const providerClasses = [...new Set(this.#providerClasses)];
      const providerInstances = providerClasses.map((ProviderClass) => {
        this.assertProviderClass(ProviderClass);
        const provider = new ProviderClass();
        if (typeof provider.register !== "function") {
          throw new TypeError(
            `Provider "${ProviderClass.name}" must define a callable register(container) lifecycle hook.`,
          );
        }
        return provider;
      });

      for (const provider of providerInstances) {
        await provider.register(rootContainer);
      }

      this.#providerInstances = Object.freeze(providerInstances);

      if (this.#adapter && adapterRuntime) {
        const hostContext = this.createAdapterHostContext(
          this.#adapter,
          rootContainer,
          this.#runtimeRegistry,
        );
        const consumerContext = Object.freeze({
          ...hostContext,
          invoke: <Result = unknown>(
            plan: ManagedMethodPlan,
            callerArguments: readonly unknown[] = [],
            options: ManagedInvocationOptions = {},
          ) => this.invokeManagedMethod<Result>(plan, callerArguments, options),
        }) satisfies RuntimeRegistryConsumerContext;
        for (const consumer of adapterRuntime.registryConsumers) {
          await consumer.consume(this.#runtimeRegistry, consumerContext);
        }
        await Adapter.start(this.#adapter, hostContext);
      }
      this.#state = "running";
    } catch (error) {
      this.#state = "failed";
      throw error;
    }
  }

  async runInvocation<Result>(
    handler: (context: InvocationContext<ApplicationContext>) => Result | Promise<Result>,
    options: ManagedInvocationOptions<ApplicationContext> = {},
  ): Promise<Result> {
    if (this.#state !== "running") {
      throw new ApplicationStateError(
        `Managed invocations require a running Application; current state is "${this.#state}".`,
      );
    }

    const rootContainer = this.#rootContainer as Container;
    const invocationContainer = rootContainer.createChild();
    const context = Object.freeze({
      id: this.#nextInvocationId++,
      application: this,
      applicationContext: this.#hasApplicationContext
        ? this.#applicationContext as ApplicationContext
        : undefined,
      rootContainer,
      container: invocationContainer,
    }) satisfies InvocationContext<ApplicationContext>;

    invocationContainer.value(INVOCATION_CONTEXT, context as InvocationContext);
    await options.configure?.(context);

    for (const provider of this.#providerInstances) {
      await provider.boot?.(context);
    }

    return handler(context);
  }

  invokeManagedMethod<Result = unknown>(
    plan: ManagedMethodPlan,
    callerArguments: readonly unknown[] = [],
    options: ManagedInvocationOptions<ApplicationContext> = {},
  ): InvocationResult<Result> {
    return this.runInvocation(
      (context) => this.#invocationEngine.invoke<Result>(plan, context, callerArguments),
      options,
    ) as InvocationResult<Result>;
  }

  private assertConfiguring(operation: string): void {
    if (this.#state !== "configuring") {
      throw new ApplicationStateError(
        `${operation} cannot modify an Application in state "${this.#state}".`,
      );
    }
  }

  private assertProviderClass(ProviderClass: ProviderConstructor): void {
    const metadata = getManagedClassMetadata(ProviderClass);
    if (metadata?.kindId !== PROVIDER_KIND.id) {
      throw new TypeError(
        `Provider registry entry "${ProviderClass.name}" must be decorated with @Provider().`,
      );
    }
  }

  private createAdapterHostContext<Context>(
    adapter: Adapter<Context>,
    rootContainer: Container,
    registry: RuntimeRegistry,
  ): AdapterHostContext<Context> {
    if (!this.#hasApplicationContext) {
      throw new ApplicationStateError(
        `Adapter "${Adapter.compilerDescriptor(adapter).id}" did not prepare an application context.`,
      );
    }
    return Object.freeze({
      application: this as unknown as Application<Context>,
      applicationContext: this.#applicationContext as Context,
      rootContainer,
      registry,
    });
  }

  private validateRuntimeRegistry(registry: RuntimeRegistry): void {
    if (!registry || !Array.isArray(registry.classes) || !Array.isArray(registry.methods)) {
      throw new TypeError("Runtime registry is malformed; use defineRuntimeRegistry().");
    }
    const targets = new Set<Function>();
    for (const entry of registry.classes) {
      if (!entry || typeof entry !== "object" || typeof entry.target !== "function") {
        throw new TypeError("Runtime managed-class registry entries must declare a class target.");
      }
      if (targets.has(entry.target)) {
        throw new TypeError(
          `Runtime registry contains duplicate managed class target "${entry.target.name}".`,
        );
      }
      targets.add(entry.target);
      const canonicalKind = this.#invocationEngine.getClassKind(entry.kind.id);
      if (!canonicalKind || canonicalKind !== entry.kind) {
        throw new TypeError(
          `Runtime registry class "${entry.target.name}" does not use the canonical class-kind descriptor "${entry.kind.id}".`,
        );
      }
      const metadata = getManagedClassMetadata(entry.target);
      if (metadata?.kindId !== canonicalKind.id) {
        throw new TypeError(
          `Runtime registry class "${entry.target.name}" must have own managed metadata for class kind "${canonicalKind.id}".`,
        );
      }
    }
    for (const plan of registry.methods) {
      this.#invocationEngine.validate(plan);
      if (!targets.has(plan.target)) {
        throw new TypeError(
          `Runtime registry managed method "${String(plan.method)}" references class "${plan.target.name}" without a managed-class registry entry.`,
        );
      }
      const metadata = getManagedMethodMetadata(plan.target.prototype, plan.method);
      if (!metadata) {
        throw new TypeError(
          `Runtime registry managed method "${plan.target.name}.${String(plan.method)}" must have own managed-method decorator metadata.`,
        );
      }
      if (metadata.kind !== plan.kind) {
        throw new TypeError(
          `Runtime registry managed method "${plan.target.name}.${String(plan.method)}" decorator kind "${metadata.kind.id}" does not match its canonical plan kind "${plan.kind.id}".`,
        );
      }
    }
  }
}

export function defineApp<ApplicationContext = unknown>(): Application<ApplicationContext> {
  return new Application<ApplicationContext>();
}
