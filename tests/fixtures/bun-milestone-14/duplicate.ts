import { defineApp } from "@bunwire/core";
import { BunAdapter, Command } from "@bunwire/bun";
@Command("same") export class First { handle(): void {} }
@Command("same") export class Second { handle(): void {} }
export default defineApp().withAdapter(new BunAdapter({ role: "command" }));
