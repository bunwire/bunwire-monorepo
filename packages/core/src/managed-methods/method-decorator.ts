import type { ManagedMethodKind } from "./method-kind.js";
import {
  createMethodDecoratorId,
  type MethodDecoratorId,
} from "./identifiers.js";
import type { NamespacedIdentifier } from "../managed-classes/identifiers.js";
import {
  freezeCompilerSymbolReference,
  type CompilerSymbolReference,
} from "../compiler/compiler-symbol.js";

export interface ManagedMethodDecoratorDefinition<
  Options,
  Data,
  Id extends string = string,
> {
  readonly id: MethodDecoratorId<Id>;
  readonly compilerSymbol: CompilerSymbolReference;
  readonly kind: ManagedMethodKind;
  readonly createMetadata: (options: Options) => Data;
}

export interface ManagedMethodMetadata<Data = unknown> {
  readonly decoratorId: MethodDecoratorId;
  readonly kind: ManagedMethodKind;
  readonly method: PropertyKey;
  readonly data: Data;
}

type DecoratorFactory<Options> = [Options] extends [void]
  ? (options?: never) => MethodDecorator
  : undefined extends Options
    ? (options?: Exclude<Options, undefined>) => MethodDecorator
    : (options: Options) => MethodDecorator;

export type ManagedMethodDecorator<Options, Data, Id extends string = string> =
  DecoratorFactory<Options> & {
    readonly definition: ManagedMethodDecoratorDefinition<Options, Data, Id>;
  };

export interface DefineManagedMethodDecoratorOptions<
  Options,
  Data,
  Id extends NamespacedIdentifier,
> {
  readonly id: Id;
  readonly compilerSymbol: CompilerSymbolReference;
  readonly kind: ManagedMethodKind;
  readonly createMetadata: (options: Options) => Data;
}

export const MANAGED_METHOD_METADATA = Symbol.for("@bunwire/core/managed-method-metadata");

type MethodMetadataCarrier = object & {
  readonly [MANAGED_METHOD_METADATA]?: ReadonlyMap<PropertyKey, ManagedMethodMetadata>;
};

function attachManagedMethodMetadata(
  target: object,
  metadata: ManagedMethodMetadata,
): void {
  const carrier = target as MethodMetadataCarrier;
  const inherited = Object.prototype.hasOwnProperty.call(target, MANAGED_METHOD_METADATA)
    ? carrier[MANAGED_METHOD_METADATA]
    : undefined;
  if (inherited?.has(metadata.method)) {
    const existing = inherited.get(metadata.method) as ManagedMethodMetadata;
    throw new Error(
      `Method "${String(metadata.method)}" is already managed by decorator "${existing.decoratorId}" and cannot also use "${metadata.decoratorId}".`,
    );
  }
  const next = new Map(inherited ?? []);
  next.set(metadata.method, Object.freeze(metadata));
  Object.defineProperty(target, MANAGED_METHOD_METADATA, {
    configurable: true,
    enumerable: false,
    value: next,
    writable: false,
  });
}

export function getManagedMethodMetadata(
  target: object,
  method: PropertyKey,
): ManagedMethodMetadata | undefined {
  if (!Object.prototype.hasOwnProperty.call(target, MANAGED_METHOD_METADATA)) {
    return undefined;
  }
  return (target as MethodMetadataCarrier)[MANAGED_METHOD_METADATA]?.get(method);
}

export function defineManagedMethodDecorator<
  Options = void,
  Data = undefined,
  const Id extends NamespacedIdentifier = NamespacedIdentifier,
>(
  options: DefineManagedMethodDecoratorOptions<Options, Data, Id>,
): ManagedMethodDecorator<Options, Data, Id> {
  const definition = Object.freeze({
    id: createMethodDecoratorId(options.id),
    compilerSymbol: freezeCompilerSymbolReference(
      options.compilerSymbol,
      `Managed method decorator "${options.id}"`,
    ),
    kind: options.kind,
    createMetadata: options.createMetadata,
  });

  const factory = ((decoratorOptions: Options) => {
    return ((target: object, method: string | symbol | {
      readonly kind?: unknown;
      readonly name?: unknown;
      readonly metadata?: unknown;
    }, descriptor?: PropertyDescriptor) => {
      // Accept the standard decorator calling convention as well as legacy
      // TypeScript decorators. Generated plans remain runtime-authoritative,
      // while class decoration transfers this metadata to the prototype for
      // the normal runtime registry validation boundary.
      if (
        descriptor === undefined
        && typeof target === "function"
        && typeof method === "object"
        && method?.kind === "method"
      ) {
        if (
          (typeof method.name !== "string" && typeof method.name !== "symbol")
          || typeof method.metadata !== "object"
          || method.metadata === null
        ) {
          throw new TypeError(`Managed method decorator "${definition.id}" received malformed standard decorator context.`);
        }
        attachManagedMethodMetadata(method.metadata, {
          decoratorId: definition.id,
          kind: definition.kind,
          method: method.name,
          data: definition.createMetadata(decoratorOptions),
        });
        return target;
      }
      if ((typeof method !== "string" && typeof method !== "symbol") || typeof descriptor?.value !== "function") {
        throw new TypeError(
          `Managed method decorator "${definition.id}" requires a callable method "${String(method)}".`,
        );
      }
      attachManagedMethodMetadata(target, {
        decoratorId: definition.id,
        kind: definition.kind,
        method,
        data: definition.createMetadata(decoratorOptions),
      });
    }) as MethodDecorator;
  }) as ManagedMethodDecorator<Options, Data, Id>;

  Object.defineProperty(factory, "definition", {
    enumerable: true,
    value: definition,
    writable: false,
  });
  return factory;
}
