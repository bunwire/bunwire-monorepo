import { Get } from "@bunwire/bun";
import { Controller, Use } from "@bunwire/core";
import {
  AuditMiddleware,
  MethodAuditMiddleware,
  TraceMiddleware,
} from "../middleware.js";

@Use("fixture-auth:local")
@Use(AuditMiddleware)
@Use("local-stack")
@Controller("/api/admin")
export class AdminController {
  @Use(TraceMiddleware)
  @Use("fixture-auth:method")
  @Use(MethodAuditMiddleware)
  @Get("/run")
  run(): Response { return new Response("admin"); }
}
