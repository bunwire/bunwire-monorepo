import { Controller } from "@bunwire/core";
import { Route } from "@bunwire/electrobun";
import { Use as LocalUse } from "./reexports.js";
import { AuditMiddleware, AuthMiddleware } from "./middleware.js";

export const legacyCallback = (_invocation: unknown, next: () => Promise<unknown>) => next();

@LocalUse(" auth ")
@LocalUse(AuditMiddleware)
@Controller("attachments")
export class AttachmentController {
  @LocalUse(AuthMiddleware, "audit: admin , user ")
  @LocalUse("auth:method:scope")
  @Route("ordered")
  ordered() { return "ordered"; }

  @LocalUse("auth", "auth")
  @Route("repeated")
  repeated() { return "repeated"; }

  @LocalUse(legacyCallback)
  @Route("legacy")
  legacy() { return "legacy"; }
}
