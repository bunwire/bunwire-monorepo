import { BunAdapter, Job } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";

@Job({ id: "required" })
export class RequiredJob { handle(required: string): void { void required; } }

export default defineApp().withAdapter(new BunAdapter({ role: "scheduler" })).withSchedule((schedule) => {
  schedule.job(RequiredJob).everyMinute();
});
