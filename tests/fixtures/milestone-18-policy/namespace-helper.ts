import type { MiddlewarePolicyRegistry } from "@bunwire/core";
export function attach(registry: MiddlewarePolicyRegistry) { registry.use("auth"); }
