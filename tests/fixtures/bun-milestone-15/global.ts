import { BunAdapter, WebSocket } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";

@WebSocket("/global")
export class GlobalSocket { message(client: unknown, message: string) { void client; void message; } }

export default defineApp().withAdapter(new BunAdapter({ role: "http", handleSignals: false }))
  .withMiddlewares((middleware) => { middleware.use("auth"); });
