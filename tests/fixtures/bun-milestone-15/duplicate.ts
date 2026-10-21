import { BunAdapter, WebSocket } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";

@WebSocket("/chat/:room")
export class FirstSocket { message(client: unknown, message: string) { void client; void message; } }
@WebSocket("/chat/:id")
export class SecondSocket { message(client: unknown, message: string) { void client; void message; } }
export default defineApp().withAdapter(new BunAdapter({ role: "http", handleSignals: false }));
