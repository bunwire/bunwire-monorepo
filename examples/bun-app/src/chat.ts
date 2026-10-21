import { BUN_WEBSOCKET_CONNECTION, BUN_WEBSOCKET_MESSAGE, WebSocket,
  type BunWebSocketConnectionContext, type BunWebSocketMessageContext } from "@bunwire/bun";
import { Inject, Use } from "@bunwire/core";
import type { ServerWebSocket } from "bun";

@WebSocket("/api/chat")
@Use("auth")
export class ExampleChat {
  constructor(@Inject(BUN_WEBSOCKET_CONNECTION) private readonly connection: BunWebSocketConnectionContext) {}

  open(client: ServerWebSocket<unknown>): void {
    client.send(JSON.stringify({ event: "open", connectionId: this.connection.id, identity: this.connection.identity }));
  }

  message(client: ServerWebSocket<unknown>, message: string | Buffer,
    @Inject(BUN_WEBSOCKET_MESSAGE) context: BunWebSocketMessageContext): void {
    client.send(JSON.stringify({ event: "message", connectionId: this.connection.id,
      messageId: context.scope.id, identity: this.connection.identity, text: String(message) }));
  }
}
