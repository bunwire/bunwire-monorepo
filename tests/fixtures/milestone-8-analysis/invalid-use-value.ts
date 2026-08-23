import { Controller, Use } from "@bunwire/core";
import { Route } from "@bunwire/electrobun";

@Controller("invalid-use")
export class InvalidUseValueController {
  @Route("run")
  @Use(42 as never)
  run(): void {}
}
