import type { CompilerSymbolReference } from "../compiler/compiler-symbol.js";
import {
  assertMiddlewareTarget,
  type MiddlewareConstructor,
} from "../middleware/managed-middleware.js";
import type { ManagedMethodMiddleware } from "./plan.js";

export const USE_DECORATOR_ID = "core.use" as const;

export interface UseDecoratorDefinition {
  readonly id: typeof USE_DECORATOR_ID;
  readonly compilerSymbol: CompilerSymbolReference;
}

export interface UseDecorator {
  (...middleware: readonly MiddlewareReference[]): ClassDecorator & MethodDecorator;
  /** @deprecated Callback middleware is temporary migration scaffolding. */
  (...middleware: readonly ManagedMethodMiddleware[]): MethodDecorator;
  readonly definition: UseDecoratorDefinition;
}

export type MiddlewareReference = MiddlewareConstructor | string;
export type UseMiddlewareEntry = MiddlewareReference | ManagedMethodMiddleware;

const CLASS_MIDDLEWARE = Symbol("bunwire.use.class");
const middlewareMetadata = new WeakMap<
  object,
  Map<PropertyKey | typeof CLASS_MIDDLEWARE, readonly UseMiddlewareEntry[]>
>();

function attachMiddleware(
  target: object,
  propertyKey: PropertyKey | typeof CLASS_MIDDLEWARE,
  middleware: readonly UseMiddlewareEntry[],
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

const useDecorator = (...middleware: readonly UseMiddlewareEntry[]): ClassDecorator & MethodDecorator => {
  if (middleware.length === 0 || middleware.some((entry) => (
    typeof entry !== "function"
    && (typeof entry !== "string" || entry.trim().length === 0)
  ))) {
    throw new TypeError("@Use() requires at least one middleware class or non-empty string reference.");
  }
  return ((target: object, propertyKey?: PropertyKey): void => {
    const key = propertyKey ?? CLASS_MIDDLEWARE;
    if (key === CLASS_MIDDLEWARE) {
      for (const entry of middleware) {
        if (typeof entry === "function") {
          assertMiddlewareTarget(entry);
        }
      }
    }
    attachMiddleware(target, key, middleware);
  }) as ClassDecorator & MethodDecorator;
};

export const Use = Object.assign(useDecorator, { definition }) as UseDecorator;

export function getManagedMethodMiddlewareMetadata(
  target: object,
  propertyKey: PropertyKey,
): readonly ManagedMethodMiddleware[] {
  return Object.freeze((middlewareMetadata.get(target)?.get(propertyKey) ?? [])
    .filter((entry): entry is ManagedMethodMiddleware => {
      if (typeof entry !== "function") return false;
      try {
        assertMiddlewareTarget(entry);
        return false;
      } catch {
        return true;
      }
    }));
}

export function getUseMiddlewareMetadata(
  target: object,
  propertyKey?: PropertyKey,
): readonly UseMiddlewareEntry[] {
  return middlewareMetadata.get(target)?.get(propertyKey ?? CLASS_MIDDLEWARE)
    ?? Object.freeze([]);
}
