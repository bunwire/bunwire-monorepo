import { BunAdapter, BUN_WEBSOCKET_MESSAGE, WebSocket, type BunWebSocketMessageContext } from "@bunwire/bun";
import { defineApp, Inject, Service, Use } from "@bunwire/core";

@Service()
export class SocketCounter { value = 0; }

@WebSocket("/chat/:room")
@Use("auth")
export class ChatSocket {
  constructor(readonly counter: SocketCounter) {}
  open(client: unknown) { void client; }
  message(client: unknown, message: string, @Inject(BUN_WEBSOCKET_MESSAGE) context: BunWebSocketMessageContext) { void client; void message; void context; }
  close(client: unknown, code: number, reason: string) { void client; void code; void reason; }
  drain(client: unknown) { void client; }
}

export default defineApp().withAdapter(new BunAdapter({ role: "http", handleSignals: false }));
