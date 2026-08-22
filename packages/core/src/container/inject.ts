import type { RuntimeToken } from "./tokens.js";
import type { CompilerSymbolReference } from "../compiler/compiler-symbol.js";

export const INJECT_DECORATOR_ID = "core.inject.decorator" as const;

export interface InjectDecoratorDefinition {
  readonly id: typeof INJECT_DECORATOR_ID;
  readonly compilerSymbol: CompilerSymbolReference;
}

export interface InjectParameterMetadata {
  readonly token: RuntimeToken;
  readonly method: PropertyKey | undefined;
  readonly parameterIndex: number;
}

export interface InjectDecorator {
  (token: RuntimeToken): ParameterDecorator;
  readonly definition: InjectDecoratorDefinition;
}

export const INJECT_PARAMETER_METADATA = Symbol.for("@bunwire/core/inject-parameter-metadata");

type InjectMetadataCarrier = object & {
  readonly [INJECT_PARAMETER_METADATA]?: ReadonlyMap<PropertyKey | undefined, ReadonlyMap<number, InjectParameterMetadata>>;
};

export function getInjectParameterMetadata(
  target: object,
  method: PropertyKey | undefined,
  parameterIndex: number,
): InjectParameterMetadata | undefined {
  if (!Object.prototype.hasOwnProperty.call(target, INJECT_PARAMETER_METADATA)) {
    return undefined;
  }
  return (target as InjectMetadataCarrier)[INJECT_PARAMETER_METADATA]
    ?.get(method)
    ?.get(parameterIndex);
}

const definition = Object.freeze({
  id: INJECT_DECORATOR_ID,
  compilerSymbol: Object.freeze({
    moduleSpecifier: "@bunwire/core",
    exportName: "Inject",
  }),
});

export const Inject = ((token: RuntimeToken): ParameterDecorator => (
  target: object,
  method: string | symbol | undefined,
  parameterIndex: number,
): void => {
  const carrier = target as InjectMetadataCarrier;
  const current = Object.prototype.hasOwnProperty.call(target, INJECT_PARAMETER_METADATA)
    ? carrier[INJECT_PARAMETER_METADATA]
    : undefined;
  const parameters = current?.get(method);
  if (parameters?.has(parameterIndex)) {
    throw new TypeError(
      `Parameter ${parameterIndex} already declares an explicit @Inject() source.`,
    );
  }
  const nextParameters = new Map(parameters ?? []);
  nextParameters.set(parameterIndex, Object.freeze({ token, method, parameterIndex }));
  const next = new Map(current ?? []);
  next.set(method, nextParameters);
  Object.defineProperty(target, INJECT_PARAMETER_METADATA, {
    configurable: true,
    enumerable: false,
    value: next,
    writable: false,
  });
}) as InjectDecorator;

Object.defineProperty(Inject, "definition", {
  enumerable: true,
  value: definition,
  writable: false,
});
