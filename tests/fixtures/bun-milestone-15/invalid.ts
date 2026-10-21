import { BunAdapter, WebSocket } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";
@WebSocket("/invalid")
export class InvalidSocket { message(client: unknown) { void client; } }
export default defineApp().withAdapter(new BunAdapter({ role: "http", handleSignals: false }));
