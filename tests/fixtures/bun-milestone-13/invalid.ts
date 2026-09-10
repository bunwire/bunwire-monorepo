import { BunAdapter, Job, Schedule } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";
@Job({ id: "test.job" }) export class Work { handle(required: string): void { void required; } }
@Schedule() export class Task { handle(): void {} }
const dynamic = "value";
export default defineApp().withAdapter(new BunAdapter({ role: "scheduler" })).withSchedule((schedule) => {
  schedule.job(Work, dynamic).cron("* * * * *");
  schedule.task(Task).cron("not cron");
});
