import { Service } from "@bunwire/core";

function ShadowInject(_token: unknown): ParameterDecorator {
  return () => undefined;
}
ShadowInject.definition = {
  id: "core.inject.decorator" as const,
  compilerSymbol: { moduleSpecifier: "fixture.shadow", exportName: "ShadowInject" },
};

const VALUE = Symbol("value");

@Service()
export class CounterfeitInjectService {
  constructor(@ShadowInject(VALUE) _value: unknown) {}
}
