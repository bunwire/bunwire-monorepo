import {
  BUN_WEBSOCKET_CHANNELS, BUN_WEBSOCKET_CONNECTION, WebSocket, defineBunWebSocketMessages,
  type BunWebSocketChannels, type BunWebSocketConnectionContext,
} from "@bunwire/bun";
import { Inject, Use } from "@bunwire/core";
import type { ServerWebSocket } from "bun";

const messages = defineBunWebSocketMessages({
  join: (value: unknown): value is { channel: string } => typeof value === "object" && value !== null
    && typeof (value as { channel?: unknown }).channel === "string",
  chat: (value: unknown): value is { channel: string; text: string } => typeof value === "object" && value !== null
    && typeof (value as { channel?: unknown }).channel === "string"
    && typeof (value as { text?: unknown }).text === "string",
});

@WebSocket("/api/v2/chat")
@Use("auth")
export class V2Chat {
  constructor(
    @Inject(BUN_WEBSOCKET_CONNECTION) private readonly connection: BunWebSocketConnectionContext,
    @Inject(BUN_WEBSOCKET_CHANNELS) private readonly channels: BunWebSocketChannels,
  ) {}

  open(client: ServerWebSocket<unknown>): void {
    client.send(JSON.stringify({ event: "open", id: this.connection.id, identity: this.connection.identity }));
  }

  async message(client: ServerWebSocket<unknown>, raw: string | Buffer): Promise<void> {
    const envelope = messages.decode(raw);
    if (envelope.type === "join") {
      client.send(JSON.stringify({ event: "join", allowed: await this.channels.join(envelope.payload.channel) }));
    } else {
      const delivery = this.channels.broadcast(envelope.payload.channel, messages.encode("chat", envelope.payload));
      client.send(JSON.stringify({ event: "chat", delivery }));
    }
  }
}
