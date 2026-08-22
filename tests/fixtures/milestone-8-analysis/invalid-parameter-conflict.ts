import { Inject, createToken } from "@bunwire/core";
import { Consumer, FrameworkValue, Subscribe } from "./extensions.js";

const VALUE = createToken<string>("conflict");

@Consumer("conflict")
export class ConflictingConsumer {
  @Subscribe("conflict")
  invalid(@FrameworkValue() @Inject(VALUE) value: string): void {
    void value;
  }
}
