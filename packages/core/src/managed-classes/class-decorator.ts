import type { ManagedClassKind } from "./class-kind.js";
import {
  freezeCompilerSymbolReference,
  type CompilerSymbolReference,
} from "../compiler/compiler-symbol.js";
import {
  createClassDecoratorId,
  type ClassDecoratorId,
  type NamespacedIdentifier,
} from "./identifiers.js";
import {
  attachManagedClassMetadata,
  type ManagedClassMetadata,
  type ManagedClassTarget,
} from "./metadata.js";

export interface ManagedClassDecoratorDefinition<
  Options,
  Data,
  Id extends string = string,
> {
  readonly id: ClassDecoratorId<Id>;
  readonly compilerSymbol: CompilerSymbolReference;
  readonly kind: ManagedClassKind;
  readonly createMetadata: (options: Options) => Data;
  readonly validateTarget: ((target: ManagedClassTarget) => void) | undefined;
}

type DecoratorFactory<Options> = [Options] extends [void]
  ? (options?: never) => ClassDecorator
  : undefined extends Options
    ? (options?: Exclude<Options, undefined>) => ClassDecorator
    : (options: Options) => ClassDecorator;

type BareDecorator<Options> = [Options] extends [void]
  ? ClassDecorator
  : undefined extends Options
    ? ClassDecorator
    : unknown;

export type ManagedClassDecorator<Options, Data, Id extends string = string> =
  DecoratorFactory<Options> & BareDecorator<Options> & {
    readonly definition: ManagedClassDecoratorDefinition<Options, Data, Id>;
  };

export interface DefineManagedClassDecoratorOptions<
  Options,
  Data,
  Id extends NamespacedIdentifier,
> {
  readonly id: Id;
  readonly compilerSymbol: CompilerSymbolReference;
  readonly kind: ManagedClassKind;
  readonly createMetadata: (options: Options) => Data;
  readonly validateTarget?: (target: ManagedClassTarget) => void;
}

export function defineManagedClassDecorator<
  Options = void,
  Data = undefined,
  const Id extends NamespacedIdentifier = NamespacedIdentifier,
>(
  options: DefineManagedClassDecoratorOptions<Options, Data, Id>,
): ManagedClassDecorator<Options, Data, Id> {
  const definition = Object.freeze({
    id: createClassDecoratorId(options.id),
    compilerSymbol: freezeCompilerSymbolReference(
      options.compilerSymbol,
      `Managed class decorator "${options.id}"`,
    ),
    kind: options.kind,
    createMetadata: options.createMetadata,
    validateTarget: options.validateTarget,
  });

  const decorate = (
    decoratorOptions: Options,
    target: Function,
    standardContext?: { readonly kind?: unknown; readonly metadata?: unknown },
  ): void => {
      const managedTarget = target as ManagedClassTarget;
      definition.validateTarget?.(managedTarget);
      const metadata: ManagedClassMetadata<Data> = {
        decoratorId: definition.id,
        kindId: definition.kind.id,
        target: managedTarget,
        data: definition.createMetadata(decoratorOptions),
      };
      attachManagedClassMetadata(managedTarget, metadata);
      if (
        standardContext?.kind === "class"
        && typeof standardContext.metadata === "object"
        && standardContext.metadata !== null
      ) {
        const standardMetadata = standardContext.metadata as Record<PropertyKey, unknown>;
        for (const metadataKey of [
          Symbol.for("@bunwire/core/managed-method-metadata"),
          Symbol.for("@bunwire/core/use-middleware-metadata"),
        ]) {
          const metadata = standardMetadata[metadataKey];
          if (metadata instanceof Map) {
            Object.defineProperty(managedTarget.prototype, metadataKey, {
              configurable: true,
              enumerable: false,
              value: new Map(metadata),
              writable: false,
            });
          }
        }
      }
  };

  const factory = (function (...args: readonly unknown[]): ClassDecorator | void {
    const [value, standardContext] = args;
    const isBareLegacyDecorator = args.length === 1 && typeof value === "function";
    const isBareStandardDecorator = args.length === 2
      && typeof value === "function"
      && typeof standardContext === "object"
      && standardContext !== null
      && (standardContext as { readonly kind?: unknown }).kind === "class";
    if (isBareLegacyDecorator || isBareStandardDecorator) {
      decorate(undefined as Options, value as Function, standardContext as {
        readonly kind?: unknown;
        readonly metadata?: unknown;
      } | undefined);
      return;
    }
    const decoratorOptions = value as Options;
    return ((target: Function, context?: { readonly kind?: unknown; readonly metadata?: unknown }) => {
      decorate(decoratorOptions, target, context);
    }) as ClassDecorator;
  }) as ManagedClassDecorator<Options, Data, Id>;

  Object.defineProperty(factory, "definition", {
    enumerable: true,
    value: definition,
    writable: false,
  });

  return factory;
}
