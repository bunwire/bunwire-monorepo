import { Controller, Use } from "@bunwire/core";
import { Handle } from "proof-static";
import { trace } from "../../middleware.js";
@Controller("admin") @Use("audit:controller")
export class Panel {
  @Handle({ name: "run" }) @Use("audit:method")
  run(): string { trace.push("handler"); return "admin"; }
}
