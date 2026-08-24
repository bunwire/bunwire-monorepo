import { Controller } from "@bunwire/core";
import { Route } from "@bunwire/electrobun";

@Controller("public")
export class PublicController {
  @Route("run")
  run() { return "public"; }
}
