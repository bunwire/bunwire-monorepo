import type { MiddlewarePolicyRegistry } from "@bunwire/core";
import { COMMON_SECURITY, ADMIN_GLOB } from "../milestone-17-policy/values.js";

export function registerWeb(registry: MiddlewarePolicyRegistry) {
  const name = "web";
  registry.group(name, COMMON_SECURITY);
}

export const registerAdmin = (registry: MiddlewarePolicyRegistry) => {
  registerWeb(registry);
  const group = "admin";
  const values = [...COMMON_SECURITY, "can:admin.access"];
  registry.group(group, values);
  registry.controllers({ [ADMIN_GLOB]: group });
};
