import { defineApp } from "@bunwire/core";
import { BunAdapter } from "@bunwire/bun";
function Command(_name: string): ClassDecorator { return () => undefined; }
@Command("fake") export class Invalid { handle(): void {} }
export default defineApp().withAdapter(new BunAdapter({ role: "command" }));
