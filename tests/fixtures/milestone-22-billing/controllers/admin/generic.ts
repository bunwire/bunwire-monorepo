import { Controller, Use } from "@bunwire/core";
import { Handle } from "proof-static";
import { trace } from "../../middleware.js";

@Controller("admin") @Use("billing-audit:controller")
export class GenericPanel {
  @Handle({ name: "run" }) @Use("billing-audit:method")
  run(): string { trace.push("handler"); return "admin"; }
}
