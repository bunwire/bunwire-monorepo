import {
  assertNamespacedIdentifier,
  type NamespacedIdentifier,
} from "../managed-classes/identifiers.js";
import {
  createParameterInjectorId,
  type ParameterInjectorId,
  type ParameterResolverId,
} from "./identifiers.js";
import {
  freezeCompilerSymbolReference,
  type CompilerSymbolReference,
} from "../compiler/compiler-symbol.js";

export interface ParameterInjectorDefinition<
  Options = unknown,
  Data = unknown,
  Id extends string = string,
> {
  readonly id: ParameterInjectorId<Id>;
  readonly compilerSymbol: CompilerSymbolReference;
  readonly resolverId: ParameterResolverId;
  readonly createMetadata: (options: Options) => Data;
}

export interface ParameterInjectorMetadata<Data = unknown> {
  readonly injectorId: ParameterInjectorId;
  readonly resolverId: ParameterResolverId;
  readonly method: PropertyKey;
  readonly parameterIndex: number;
  readonly data: Data;
}

type InjectorFactory<Options> = [Options] extends [void]
  ? (options?: never) => ParameterDecorator
  : undefined extends Options
    ? (options?: Exclude<Options, undefined>) => ParameterDecorator
    : (options: Options) => ParameterDecorator;

export type ParameterInjector<Options, Data, Id extends string = string> =
  InjectorFactory<Options> & {
    readonly definition: ParameterInjectorDefinition<Options, Data, Id>;
  };

export interface DefineParameterInjectorOptions<
  Options,
  Data,
  Id extends NamespacedIdentifier,
> {
  readonly id: Id;
  readonly compilerSymbol: CompilerSymbolReference;
  readonly resolverId: ParameterResolverId;
  readonly createMetadata: (options: Options) => Data;
}

export const PARAMETER_INJECTOR_METADATA = Symbol.for("@bunwire/core/parameter-injector-metadata");

type InjectorMetadataCarrier = object & {
  readonly [PARAMETER_INJECTOR_METADATA]?: ReadonlyMap<PropertyKey, ReadonlyMap<number, ParameterInjectorMetadata>>;
};

function attachParameterInjectorMetadata(target: object, metadata: ParameterInjectorMetadata): void {
  const carrier = target as InjectorMetadataCarrier;
  const current = Object.prototype.hasOwnProperty.call(target, PARAMETER_INJECTOR_METADATA)
    ? carrier[PARAMETER_INJECTOR_METADATA]
    : undefined;
  const methodParameters = current?.get(metadata.method);
  if (methodParameters?.has(metadata.parameterIndex)) {
    const existing = methodParameters.get(metadata.parameterIndex) as ParameterInjectorMetadata;
    throw new Error(
      `Method "${String(metadata.method)}" parameter ${metadata.parameterIndex} already uses parameter injector "${existing.injectorId}" and cannot also use "${metadata.injectorId}".`,
    );
  }

  const nextMethodParameters = new Map(methodParameters ?? []);
  nextMethodParameters.set(metadata.parameterIndex, Object.freeze(metadata));
  const next = new Map(current ?? []);
  next.set(metadata.method, nextMethodParameters);
  Object.defineProperty(target, PARAMETER_INJECTOR_METADATA, {
    configurable: true,
    enumerable: false,
    value: next,
    writable: false,
  });
}

export function getParameterInjectorMetadata(
  target: object,
  method: PropertyKey,
  parameterIndex: number,
): ParameterInjectorMetadata | undefined {
  if (!Object.prototype.hasOwnProperty.call(target, PARAMETER_INJECTOR_METADATA)) {
    return undefined;
  }
  return (target as InjectorMetadataCarrier)[PARAMETER_INJECTOR_METADATA]
    ?.get(method)
    ?.get(parameterIndex);
}

export function defineParameterInjector<
  Options = void,
  Data = undefined,
  const Id extends NamespacedIdentifier = NamespacedIdentifier,
>(
  options: DefineParameterInjectorOptions<Options, Data, Id>,
): ParameterInjector<Options, Data, Id> {
  assertNamespacedIdentifier(options.resolverId, "Parameter-injector resolver ID");
  if (typeof options.createMetadata !== "function") {
    throw new TypeError(`Parameter injector "${options.id}" requires a callable metadata factory.`);
  }
  const definition = Object.freeze({
    id: createParameterInjectorId(options.id),
    compilerSymbol: freezeCompilerSymbolReference(
      options.compilerSymbol,
      `Parameter injector "${options.id}"`,
    ),
    resolverId: options.resolverId,
    createMetadata: options.createMetadata,
  });
  const factory = ((decoratorOptions: Options) => {
    return ((target: object, method: string | symbol | undefined, parameterIndex: number) => {
      if (method === undefined) {
        throw new TypeError(
          `Parameter injector "${definition.id}" may only decorate managed method parameters.`,
        );
      }
      attachParameterInjectorMetadata(target, {
        injectorId: definition.id,
        resolverId: definition.resolverId,
        method,
        parameterIndex,
        data: definition.createMetadata(decoratorOptions),
      });
    }) as ParameterDecorator;
  }) as ParameterInjector<Options, Data, Id>;
  Object.defineProperty(factory, "definition", {
    enumerable: true,
    value: definition,
    writable: false,
  });
  return factory;
}
