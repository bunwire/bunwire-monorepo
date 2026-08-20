import { Container } from "../container/container.js";
import { PROVIDER_KIND } from "../managed-classes/built-ins.js";
import type { ManagedClassKind } from "../managed-classes/class-kind.js";
import { getManagedClassMetadata } from "../managed-classes/metadata.js";
import { InvocationEngine, type InvocationResult } from "../managed-methods/invocation-engine.js";
import type { ManagedMethodPlan } from "../managed-methods/plan.js";
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
  #rootContainer: Container | undefined;
  #providerInstances: readonly ProviderLifecycle[] = Object.freeze([]);
  #nextInvocationId = 1;
  readonly #invocationEngine = new InvocationEngine();

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

  withManagedClassKind(kind: ManagedClassKind): this {
    this.assertConfiguring("withManagedClassKind()");
    this.#invocationEngine.registerClassKind(kind);
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

      if (this.#hasConfiguredContext) {
        rootContainer.value(APPLICATION_CONTEXT, this.#configuredContext);
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
      applicationContext: this.#hasConfiguredContext
        ? this.#configuredContext as ApplicationContext
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
}

export function defineApp<ApplicationContext = unknown>(): Application<ApplicationContext> {
  return new Application<ApplicationContext>();
}
