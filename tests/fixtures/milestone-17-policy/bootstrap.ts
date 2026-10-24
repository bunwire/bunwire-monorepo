import { defineApp } from "@bunwire/core";
import { COMMON_SECURITY, GLOBAL, GROUP_ARGS, ADMIN_MAPPING } from "./barrel.js";
export default defineApp().withMiddlewares((registry) => {
  registry.use(...GLOBAL);
  registry.group(...GROUP_ARGS);
  registry.group("admin", [...COMMON_SECURITY, "can:admin.access"]);
  registry.controllers(ADMIN_MAPPING);
});
