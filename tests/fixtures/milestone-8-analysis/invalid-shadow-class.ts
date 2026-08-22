import {
  SERVICE_KIND,
  defineManagedClassDecorator,
} from "@bunwire/core";

const ShadowService = defineManagedClassDecorator<
  void,
  undefined,
  "core.service.decorator"
>({
  id: "core.service.decorator",
  compilerSymbol: { moduleSpecifier: "fixture.shadow", exportName: "ShadowService" },
  kind: SERVICE_KIND,
  createMetadata: () => undefined,
});

@ShadowService()
export class CounterfeitService {}
