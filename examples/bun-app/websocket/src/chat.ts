import { BUN_WEBSOCKET_CONNECTION, BUN_WEBSOCKET_MESSAGE, WebSocket,
  type BunWebSocketConnectionContext, type BunWebSocketMessageContext } from "@bunwire/bun";
import { Inject, Use } from "@bunwire/core";
import type { ServerWebSocket } from "bun";

@WebSocket("/chat/:room")
@Use("auth")
export class ChatSocket {
  constructor(@Inject(BUN_WEBSOCKET_CONNECTION) private readonly connection: BunWebSocketConnectionContext) {}

  open(client: ServerWebSocket<unknown>): void {
    client.subscribe(this.connection.params.room!);
    client.send(`Connected to ${this.connection.params.room}`);
  }

  message(client: ServerWebSocket<unknown>, message: string | Buffer,
    @Inject(BUN_WEBSOCKET_MESSAGE) context: BunWebSocketMessageContext): void {
    const name = (this.connection.identity as { userId: string }).userId;
    const text = `${name}: ${String(message)}`;
    client.send(`You sent: ${String(message)} (message scope ${context.scope.id})`);
    client.publish(this.connection.params.room!, text);
  }

  close(_client: ServerWebSocket<unknown>, code: number, reason: string): void {
    console.log(`Connection ${this.connection.id} closed: ${code} ${reason}`);
  }
}
