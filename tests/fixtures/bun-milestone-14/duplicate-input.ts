import { defineApp } from "@bunwire/core";
import { Argument, BunAdapter, Command, Option } from "@bunwire/bun";
@Command("invalid") export class Invalid { handle(@Argument("value") _first: string, @Option("value") _second: string): void {} }
export default defineApp().withAdapter(new BunAdapter({ role: "command" }));
