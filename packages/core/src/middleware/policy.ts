import type { MiddlewareReference } from "../managed-methods/middleware-decorator.js";

export interface MiddlewarePolicyRegistry {
  use(...references: readonly MiddlewareReference[]): void;
  group(name: string, references: readonly MiddlewareReference[]): void;
  controllers(mapping: Readonly<Record<
    string,
    MiddlewareReference | readonly MiddlewareReference[]
  >>): void;
}

export type MiddlewarePolicyConfiguration = (registry: MiddlewarePolicyRegistry) => void;
