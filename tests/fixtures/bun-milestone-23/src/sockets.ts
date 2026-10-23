import {
  BUN_WEBSOCKET_CHANNELS, BUN_WEBSOCKET_CONNECTION, WebSocket, defineBunWebSocketMessages,
  type BunWebSocketChannels, type BunWebSocketConnectionContext,
} from "@bunwire/bun";
import { Inject, Use } from "@bunwire/core";
import type { ServerWebSocket } from "bun";

const messages = defineBunWebSocketMessages({
  join: (value: unknown): value is { channel: string } => typeof value === "object" && value !== null
    && typeof (value as { channel?: unknown }).channel === "string",
  direct: (value: unknown): value is { id: number; text: string } => typeof value === "object" && value !== null
    && Number.isSafeInteger((value as { id?: unknown }).id) && typeof (value as { text?: unknown }).text === "string",
  broadcast: (value: unknown): value is { channel: string; text: string } => typeof value === "object" && value !== null
    && typeof (value as { channel?: unknown }).channel === "string"
    && typeof (value as { text?: unknown }).text === "string",
});

@WebSocket("/chat")
@Use("auth")
export class ChatSocket {
  constructor(
    @Inject(BUN_WEBSOCKET_CONNECTION) private readonly connection: BunWebSocketConnectionContext,
    @Inject(BUN_WEBSOCKET_CHANNELS) private readonly channels: BunWebSocketChannels,
  ) {}

  open(client: ServerWebSocket<unknown>): void {
    client.send(JSON.stringify({ event: "open", id: this.connection.id, identity: this.connection.identity,
      scope: this.connection.scope.id }));
  }

  async message(client: ServerWebSocket<unknown>, raw: string | Buffer): Promise<void> {
    const message = messages.decode(raw);
    if (message.type === "join") {
      const allowed = await this.channels.join(message.payload.channel);
      client.send(JSON.stringify({ event: "join", allowed, channel: message.payload.channel }));
    } else if (message.type === "direct") {
      const delivery = this.channels.send(message.payload.id, message.payload.text);
      client.send(JSON.stringify({ event: "direct", delivery }));
    } else {
      const delivery = this.channels.broadcast(message.payload.channel, message.payload.text);
      client.send(JSON.stringify({ event: "broadcast", delivery }));
    }
  }

  close(_client: ServerWebSocket<unknown>, _code: number, _reason: string): void {
    console.log(`CLOSED ${this.connection.id}`);
  }
}
