import { BunAdapter } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";
import { AuditMiddleware } from "./middleware.js";

export default defineApp()
  .withAdapter(new BunAdapter())
  .withMiddlewares((middleware) => {
    middleware.group("global-stack", ["base", AuditMiddleware]);
    middleware.use("global-stack");
    middleware.group("base", ["auth"]);
    middleware.group("local-stack", ["audit:local-group"]);
    middleware.controllers({
      "controllers/**": "trace",
      "controllers/admin.ts": ["auth:mapped", "trace"],
    });
  });
