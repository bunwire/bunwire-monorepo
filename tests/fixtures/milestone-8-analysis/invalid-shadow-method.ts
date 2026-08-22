import { defineManagedMethodDecorator } from "@bunwire/core";
import {
  CONSUMER_KIND,
  Consumer,
  SUBSCRIBE_KIND,
} from "./extensions.js";

const ShadowSubscribe = defineManagedMethodDecorator<
  string,
  { readonly topic: string },
  "fixture.subscribe.decorator"
>({
  id: "fixture.subscribe.decorator",
  compilerSymbol: { moduleSpecifier: "fixture.shadow", exportName: "ShadowSubscribe" },
  kind: SUBSCRIBE_KIND,
  createMetadata: (topic) => ({ topic }),
});

@Consumer()
export class ShadowMethodConsumer {
  @ShadowSubscribe("counterfeit")
  handle(): void {}
}

void CONSUMER_KIND;
