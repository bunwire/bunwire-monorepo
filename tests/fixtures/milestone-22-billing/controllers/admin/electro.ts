import { Controller, Use } from "@bunwire/core";
import { Route } from "@bunwire/electrobun";
import { trace } from "../../middleware.js";

@Controller("admin") @Use("billing-audit:controller")
export class ElectroPanel {
  @Route("run") @Use("billing-audit:method")
  run(): string { trace.push("handler"); return "admin"; }
}
