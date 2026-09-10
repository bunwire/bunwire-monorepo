import { BunAdapter, Job, Schedule } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";

@Schedule("0 4 * JAN,MAR MON-FRI")
export class Cleanup { handle(): void {} }

@Schedule()
export class Reconcile { handle(): void {} }

@Job({ id: "reports.generate" })
export class Report { handle(id: string, limit?: number): void { void id; void limit; } }

export default defineApp().withAdapter(new BunAdapter({ role: "scheduler", handleSignals: false }))
  .withSchedule((schedule) => {
    schedule.job(Report, "daily", -10).dailyAt("04:30").timezone("Africa/Lagos").id("reports.daily").withoutOverlapping();
    schedule.task(Reconcile).everyMinute().id("reconcile");
    schedule.task(Reconcile).hourlyAt(15).id("reconcile.hourly").withoutOverlapping().onOneServer().lockFor(500);
  });
