import type { ApplicationScheduleRegistry, MiddlewarePolicyRegistry } from "@bunwire/core";
import { Charge } from "./jobs.js";
import { COMMON, SCHEDULE_ARGS, TIME } from "./values.js";

export function registerSecurity(registry: MiddlewarePolicyRegistry) {
  registry.group("admin", [...COMMON, "billing-can:admin.access"]);
}

export function registerBilling(schedule: ApplicationScheduleRegistry) {
  const jobs = [Charge] as const;
  for (const job of jobs) {
    schedule.job(job, ...SCHEDULE_ARGS).dailyAt(TIME).timezone("UTC")
      .id("billing.daily").withoutOverlapping();
  }
}
