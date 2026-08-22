import { Consumer, Subscribe } from "./extensions.js";

@Consumer()
export class DeclarationMethodConsumer {
  @Subscribe("overload")
  handle(value: string): string;
  handle(value: string): string {
    return value;
  }
}
