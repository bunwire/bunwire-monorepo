import { Consumer, Subscribe } from "./extensions.js";

@Consumer()
export abstract class AbstractMethodConsumer {
  @Subscribe("abstract")
  abstract handle(value: string): void;
}
