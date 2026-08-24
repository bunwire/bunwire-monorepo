import type { CompilerSymbolReference } from "../compiler/compiler-symbol.js";
import {
  assertMiddlewareTarget,
  type MiddlewareConstructor,
} from "../middleware/managed-middleware.js";

export const USE_DECORATOR_ID = "core.use" as const;

export interface UseDecoratorDefinition {
  readonly id: typeof USE_DECORATOR_ID;
  readonly compilerSymbol: CompilerSymbolReference;
}

export interface UseDecorator {
  (...middleware: readonly MiddlewareReference[]): ClassDecorator & MethodDecorator;
  readonly definition: UseDecoratorDefinition;
}

export type MiddlewareReference = MiddlewareConstructor | string;

const CLASS_MIDDLEWARE = Symbol("bunwire.use.class");
const STANDARD_USE_MIDDLEWARE_METADATA = Symbol.for("@bunwire/core/use-middleware-metadata");
const middlewareMetadata = new WeakMap<
  object,
  Map<PropertyKey | typeof CLASS_MIDDLEWARE, readonly MiddlewareReference[]>
>();

interface StandardUseDecoratorContext {
  readonly kind?: unknown;
  readonly name?: unknown;
  readonly metadata?: unknown;
}

type StandardUseMetadataCarrier = {
  readonly [STANDARD_USE_MIDDLEWARE_METADATA]?: ReadonlyMap<PropertyKey, readonly MiddlewareReference[]>;
};

function attachMiddleware(
  target: object,
  propertyKey: PropertyKey | typeof CLASS_MIDDLEWARE,
  middleware: readonly MiddlewareReference[],
): void {
  let methods = middlewareMetadata.get(target);
  if (!methods) {
    methods = new Map();
    middlewareMetadata.set(target, methods);
  }
  const existing = methods.get(propertyKey) ?? [];
  methods.set(propertyKey, Object.freeze([...middleware, ...existing]));
}

function attachStandardMethodMiddleware(
  metadata: object,
  propertyKey: PropertyKey,
  middleware: readonly MiddlewareReference[],
): void {
  const carrier = metadata as StandardUseMetadataCarrier;
  const existing = carrier[STANDARD_USE_MIDDLEWARE_METADATA];
  const methods = new Map(existing ?? []);
  methods.set(propertyKey, Object.freeze([
    ...middleware,
    ...(methods.get(propertyKey) ?? []),
  ]));
  Object.defineProperty(metadata, STANDARD_USE_MIDDLEWARE_METADATA, {
    configurable: true,
    enumerable: false,
    value: methods,
    writable: false,
  });
}

const definition = Object.freeze({
  id: USE_DECORATOR_ID,
  compilerSymbol: Object.freeze({
    moduleSpecifier: "@bunwire/core",
    exportName: "Use",
  }),
});

const useDecorator = (...middleware: readonly MiddlewareReference[]): ClassDecorator & MethodDecorator => {
  if (middleware.length === 0 || middleware.some((entry) => (
    typeof entry !== "function"
    && (typeof entry !== "string" || entry.trim().length === 0)
  ))) {
    throw new TypeError("@Use() requires at least one middleware class or non-empty string reference.");
  }
  for (const entry of middleware) {
    if (typeof entry === "function") assertMiddlewareTarget(entry);
  }
  return ((target: object, propertyKey?: PropertyKey | StandardUseDecoratorContext): void => {
    if (propertyKey && typeof propertyKey === "object") {
      if (propertyKey.kind === "class") {
        attachMiddleware(target, CLASS_MIDDLEWARE, middleware);
        return;
      }
      if (propertyKey.kind === "method"
        && (typeof propertyKey.name === "string" || typeof propertyKey.name === "symbol")
        && typeof propertyKey.metadata === "object"
        && propertyKey.metadata !== null) {
        attachStandardMethodMiddleware(propertyKey.metadata, propertyKey.name, middleware);
        return;
      }
      throw new TypeError("@Use() received malformed standard decorator context.");
    }
    attachMiddleware(target, propertyKey ?? CLASS_MIDDLEWARE, middleware);
  }) as ClassDecorator & MethodDecorator;
};

export const Use = Object.assign(useDecorator, { definition }) as UseDecorator;

export function getUseMiddlewareMetadata(
  target: object,
  propertyKey?: PropertyKey,
): readonly MiddlewareReference[] {
  return middlewareMetadata.get(target)?.get(propertyKey ?? CLASS_MIDDLEWARE)
    ?? (target as StandardUseMetadataCarrier)[STANDARD_USE_MIDDLEWARE_METADATA]?.get(
      propertyKey ?? CLASS_MIDDLEWARE,
    )
    ?? Object.freeze([]);
}
