import { defineApp, Inject, createToken } from "@bunwire/core";
import { BunAdapter, Command } from "@bunwire/bun";
export const VALUE = createToken<string>("test.value");
@Command("invalid") export class Invalid { handle(@Inject(VALUE) _value: string): void {} }
export default defineApp().withAdapter(new BunAdapter({ role: "command" }));
