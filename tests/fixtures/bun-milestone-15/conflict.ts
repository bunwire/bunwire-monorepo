import { BunAdapter, Get, WebSocket } from "@bunwire/bun";
import { Controller, defineApp } from "@bunwire/core";

@Controller("/chat")
export class ChatController { @Get(":room") index() { return "hello"; } }
@WebSocket("/chat/:id")
export class ChatSocket { message(client: unknown, message: string) { void client; void message; } }
export default defineApp().withAdapter(new BunAdapter({ role: "http", handleSignals: false }));
