import {
  createParameterResolverId,
  defineParameterInjector,
} from "@bunwire/core";
import { Consumer, Subscribe } from "./extensions.js";

const ShadowFrameworkValue = defineParameterInjector<
  void,
  undefined,
  "fixture.framework-value.decorator"
>({
  id: "fixture.framework-value.decorator",
  compilerSymbol: { moduleSpecifier: "fixture.shadow", exportName: "ShadowFrameworkValue" },
  resolverId: createParameterResolverId("fixture.shadow-framework"),
  createMetadata: () => undefined,
});

@Consumer()
export class ShadowParameterConsumer {
  @Subscribe("counterfeit")
  handle(@ShadowFrameworkValue() _value: unknown): void {}
}
