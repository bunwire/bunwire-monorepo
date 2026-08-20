import type { Container } from "../container/container.js";
import type { InvocationContext } from "./invocation-context.js";

export interface ProviderLifecycle {
  register(container: Container): void | Promise<void>;
  boot?(context: InvocationContext): void | Promise<void>;
}

export type ProviderConstructor = new () => ProviderLifecycle;

export interface ProviderRegistry {
  readonly providers: readonly ProviderConstructor[];
}

export type ConventionRegistration = (container: Container) => void | Promise<void>;

export function defineProviderRegistry(
  providers: readonly ProviderConstructor[],
): ProviderRegistry {
  return Object.freeze({
    providers: Object.freeze([...providers]),
  });
}
