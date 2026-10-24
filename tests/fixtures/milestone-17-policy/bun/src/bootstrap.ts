import { defineApp } from "@bunwire/core";
import { BunAdapter, SyncQueueDriver } from "@bunwire/bun";
import { Report, Cleanup } from "./jobs.js";
import { PAYLOAD, TIME, TIMEZONE, ID, MINUTE_ARGS, LOCK } from "../values.js";
const JOBS = [Report] as const;
export default defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false, queues: { driver: new SyncQueueDriver() } }))
  .withSchedule((schedule) => {
    schedule.job(JOBS[0], ...PAYLOAD).dailyAt(TIME).timezone(TIMEZONE).id(ID).withoutOverlapping();
    schedule.task(Cleanup).hourlyAt(...MINUTE_ARGS).id("cleanup").lockFor(LOCK);
  });
