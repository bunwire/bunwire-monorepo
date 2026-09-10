import { BunAdapter } from "@bunwire/bun";
import { defineApp, Service } from "@bunwire/core";

@Service()
export class NotATask { handle(): void {} }

export default defineApp().withAdapter(new BunAdapter({ role: "scheduler" })).withSchedule((schedule) => {
  schedule.task(NotATask).everyMinute();
});
