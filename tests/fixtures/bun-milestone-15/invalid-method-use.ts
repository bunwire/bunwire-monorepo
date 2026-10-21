import { BunAdapter, WebSocket } from "@bunwire/bun";
import { defineApp, Use } from "@bunwire/core";

@WebSocket("/invalid-method-use")
export class InvalidMethodUse {
  @Use("auth")
  message(client: unknown, message: string) { void client; void message; }
}

export default defineApp().withAdapter(new BunAdapter({ role: "http", handleSignals: false }));
