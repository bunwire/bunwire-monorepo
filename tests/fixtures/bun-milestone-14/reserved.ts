import { defineApp } from "@bunwire/core";
import { BunAdapter, Command } from "@bunwire/bun";
@Command("serve") export class Invalid { handle(): void {} }
export default defineApp().withAdapter(new BunAdapter({ role: "command" }));
