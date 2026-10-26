import type { ApplicationScheduleRegistry } from "@bunwire/core";
import { Report, Cleanup } from "../milestone-17-policy/bun/src/jobs.js";
import { TIME, TIMEZONE, ID, LOCK } from "../milestone-17-policy/bun/values.js";

export function registerBillingSchedules(schedule: ApplicationScheduleRegistry, label: string) {
  const at = TIME;
  schedule.job(Report, label, { limit: 6 }).dailyAt(at).timezone(TIMEZONE).id(ID).withoutOverlapping();
}

export const registerCleanup = (schedule: ApplicationScheduleRegistry) => {
  const minute = 15;
  schedule.task(Cleanup).hourlyAt(minute).id("cleanup").lockFor(LOCK);
};
