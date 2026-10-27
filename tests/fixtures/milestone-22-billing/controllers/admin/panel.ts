import { Controller, Use } from "@bunwire/core";
import { Get } from "@bunwire/bun";
import { trace } from "../../middleware.js";

@Controller("/admin") @Use("billing-audit:controller")
export class Panel {
  @Get("/run") @Use("billing-audit:method")
  run(): string { trace.push("handler"); return "admin"; }
}
