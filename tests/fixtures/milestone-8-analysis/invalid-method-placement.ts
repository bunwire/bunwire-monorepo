import { Service } from "@bunwire/core";
import { Subscribe } from "./extensions.js";

@Service()
export class WrongMethodOwner {
  @Subscribe("wrong")
  invalid(): void {}
}
