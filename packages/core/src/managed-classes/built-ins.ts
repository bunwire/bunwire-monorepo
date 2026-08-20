import { defineManagedClassDecorator } from "./class-decorator.js";
import { defineClassKind } from "./class-kind.js";

export type ServiceScope = "singleton" | "transient";

export interface ServiceOptions {
  readonly scope?: ServiceScope;
}

export interface ServiceClassMetadata {
  readonly scope: ServiceScope;
}

export interface ControllerClassMetadata {
  readonly prefix: string | undefined;
}

export const PROVIDER_LIFECYCLE_HOOKS = Object.freeze(["register", "boot"] as const);

export type ProviderLifecycleHook = typeof PROVIDER_LIFECYCLE_HOOKS[number];
export type ProviderConstructorPolicy = "zero-arguments";

export interface ProviderClassMetadata {
  readonly lifecycleHooks: typeof PROVIDER_LIFECYCLE_HOOKS;
  readonly constructorPolicy: ProviderConstructorPolicy;
}

export const SERVICE_KIND = defineClassKind({
  id: "core.service",
  injectable: true,
  autoDiscover: true,
  analyzeConstructor: true,
  managedMethods: false,
});

export const CONTROLLER_KIND = defineClassKind({
  id: "core.controller",
  injectable: true,
  autoDiscover: true,
  analyzeConstructor: true,
  managedMethods: true,
  registry: true,
});

export const PROVIDER_KIND = defineClassKind({
  id: "core.provider",
  injectable: false,
  autoDiscover: true,
  analyzeConstructor: false,
  managedMethods: false,
  registry: true,
});

export const Service = defineManagedClassDecorator<
  ServiceOptions | undefined,
  ServiceClassMetadata
>({
  id: "core.service.decorator",
  kind: SERVICE_KIND,
  createMetadata: (options) => Object.freeze({
    scope: options?.scope ?? "singleton",
  }),
});

export const Controller = defineManagedClassDecorator<
  string | undefined,
  ControllerClassMetadata
>({
  id: "core.controller.decorator",
  kind: CONTROLLER_KIND,
  createMetadata: (prefix) => Object.freeze({ prefix }),
});

export const Provider = defineManagedClassDecorator<void, ProviderClassMetadata>({
  id: "core.provider.decorator",
  kind: PROVIDER_KIND,
  createMetadata: () => Object.freeze({
    lifecycleHooks: PROVIDER_LIFECYCLE_HOOKS,
    constructorPolicy: "zero-arguments" as const,
  }),
  validateTarget: (target) => {
    if (target.length !== 0) {
      throw new TypeError(
        `Provider "${target.name}" must be constructible with zero arguments; Bunwire does not perform Provider constructor injection in v1.`,
      );
    }
  },
});
