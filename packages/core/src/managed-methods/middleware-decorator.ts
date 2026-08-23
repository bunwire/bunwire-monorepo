import type { CompilerSymbolReference } from "../compiler/compiler-symbol.js";
import type { ManagedMethodMiddleware } from "./plan.js";

export const USE_DECORATOR_ID = "core.use" as const;

export interface UseDecoratorDefinition {
  readonly id: typeof USE_DECORATOR_ID;
  readonly compilerSymbol: CompilerSymbolReference;
}

export interface UseDecorator {
  (...middleware: readonly ManagedMethodMiddleware[]): MethodDecorator;
  readonly definition: UseDecoratorDefinition;
}

const middlewareMetadata = new WeakMap<object, Map<PropertyKey, readonly ManagedMethodMiddleware[]>>();

function attachMiddleware(
  target: object,
  propertyKey: PropertyKey,
  middleware: readonly ManagedMethodMiddleware[],
): void {
  let methods = middlewareMetadata.get(target);
  if (!methods) {
    methods = new Map();
    middlewareMetadata.set(target, methods);
  }
  const existing = methods.get(propertyKey) ?? [];
  methods.set(propertyKey, Object.freeze([...middleware, ...existing]));
}

const definition = Object.freeze({
  id: USE_DECORATOR_ID,
  compilerSymbol: Object.freeze({
    moduleSpecifier: "@bunwire/core",
    exportName: "Use",
  }),
});

const useDecorator = (...middleware: readonly ManagedMethodMiddleware[]): MethodDecorator => {
  if (middleware.length === 0 || middleware.some((entry) => typeof entry !== "function")) {
    throw new TypeError("@Use() requires at least one callable managed-method middleware.");
  }
  return (target, propertyKey): void => {
    attachMiddleware(target, propertyKey, middleware);
  };
};

export const Use = Object.assign(useDecorator, { definition }) as UseDecorator;

export function getManagedMethodMiddlewareMetadata(
  target: object,
  propertyKey: PropertyKey,
): readonly ManagedMethodMiddleware[] {
  return middlewareMetadata.get(target)?.get(propertyKey) ?? Object.freeze([]);
}
