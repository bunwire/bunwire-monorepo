import { BunAdapter, Schedule } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";

@Schedule()
export class Task { handle(): void {} }

export default defineApp().withAdapter(new BunAdapter({ role: "scheduler" }))["withSchedule"]((schedule) => {
  schedule.task(Task).everyMinute();
});
