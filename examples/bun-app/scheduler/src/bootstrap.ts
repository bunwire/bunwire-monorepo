import { BunAdapter, SyncQueueDriver } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";
import { GenerateDailyReport } from "./work.js";

export default defineApp()
  .withAdapter(new BunAdapter({
    role: "scheduler",
    queues: { driver: new SyncQueueDriver() },
  }))
  .withSchedule((schedule) => {
    schedule.job(GenerateDailyReport, "daily").everyMinute().id("example.daily-report.schedule");
  });
