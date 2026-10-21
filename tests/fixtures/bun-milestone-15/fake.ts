function WebSocket(_path: string): ClassDecorator { return () => undefined; }
@WebSocket("/fake")
export class FakeSocket { message(client: unknown, message: string) { void client; void message; } }
import { BunAdapter } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";
export default defineApp().withAdapter(new BunAdapter({ role: "http", handleSignals: false }));
