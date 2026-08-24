import { Controller, Use } from "@bunwire/core";
import { Route } from "@bunwire/electrobun";
import { AuditMiddleware, MethodAuditMiddleware, TraceMiddleware } from "../middleware.js";

@Use("auth:local")
@Use(AuditMiddleware)
@Use("local-stack")
@Controller("admin")
export class AdminController {
  @Use(TraceMiddleware)
  @Use("auth:method")
  @Use(MethodAuditMiddleware)
  @Route("run")
  run() { return "admin"; }
}
