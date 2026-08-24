import { Controller, Use } from "@bunwire/core";
import { Route } from "@bunwire/electrobun";
import { AuditMiddleware, TraceMiddleware } from "../middleware.js";

export const legacyPolicyCallback = (_invocation: unknown, next: () => Promise<unknown>) => next();

@Use("auth:local")
@Use(AuditMiddleware)
@Use("local-stack")
@Controller("admin")
export class AdminController {
  @Use(TraceMiddleware)
  @Use("auth:method")
  @Use(legacyPolicyCallback)
  @Route("run")
  run() { return "admin"; }
}
