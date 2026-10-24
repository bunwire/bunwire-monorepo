import { Controller, Use } from "@bunwire/core";
import { Route } from "@bunwire/electrobun";
import { trace } from "../../middleware.js";
@Controller("admin") @Use("audit:controller")
export class Panel {
  @Route("run") @Use("audit:method")
  run(): string { trace.push("handler"); return "admin"; }
}
