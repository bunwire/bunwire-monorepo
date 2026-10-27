import { defineApp } from "@bunwire/core";
import { ADMIN_MAPPING, GLOBAL, registerSecurity } from "./barrel.js";

export default defineApp()
  .withMiddlewares((registry) => { registry.use(...GLOBAL); })
  .withMiddlewares((registry) => { registerSecurity(registry); registry.controllers(ADMIN_MAPPING); });
