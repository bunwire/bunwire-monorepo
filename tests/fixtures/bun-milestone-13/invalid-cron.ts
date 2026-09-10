import { BunAdapter, Schedule } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";

@Schedule("not a cron")
export class InvalidCron { handle(): void {} }

export default defineApp().withAdapter(new BunAdapter({ role: "scheduler" }));
