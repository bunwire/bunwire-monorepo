import { BunAdapter } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";

function Schedule(_cron: string): ClassDecorator { return () => undefined; }
@Schedule("* * * * *")
class FakeTask { handle(): void {} }

export default defineApp().withAdapter(new BunAdapter({ role: "scheduler" })).withSchedule((schedule) => {
  schedule.task(FakeTask).everyMinute();
});
