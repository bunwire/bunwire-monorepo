import { Get } from "@bunwire/bun";
import { Controller, Use } from "@bunwire/core";
import {
  AuditMiddleware,
  MethodAuditMiddleware,
  TraceMiddleware,
} from "../middleware.js";

@Use("auth:local")
@Use(AuditMiddleware)
@Use("local-stack")
@Controller("/api/admin")
export class AdminController {
  @Use(TraceMiddleware)
  @Use("auth:method")
  @Use(MethodAuditMiddleware)
  @Get("/run")
  run(): Response { return new Response("admin"); }
}
