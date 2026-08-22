import { Consumer, Subscribe } from "./extensions.js";

@Consumer()
export class StaticMethodConsumer {
  @Subscribe("static")
  static handle(): void {}
}
