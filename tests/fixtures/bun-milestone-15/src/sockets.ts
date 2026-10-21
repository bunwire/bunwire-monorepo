import { BUN_WEBSOCKET_CONNECTION, BUN_WEBSOCKET_MESSAGE, Post, WebSocket, type BunWebSocketConnectionContext, type BunWebSocketMessageContext } from "@bunwire/bun";
import { Controller, createToken, Inject, Service, Use } from "@bunwire/core";
import type { ServerWebSocket } from "bun";

@Service()
export class SocketDependency { readonly label = "injected"; }
const MESSAGE_RESOURCE = createToken<number>("test.websocket-message-resource");

@Controller("/chat")
export class ChatHttpController {
  @Post("/:room")
  create(): object { return { http: true }; }
}

@WebSocket("/chat/:room")
@Use("auth", "can:view,room")
export class ChatSocket {
  private count = 0;
  constructor(private readonly dependency: SocketDependency, @Inject(BUN_WEBSOCKET_CONNECTION) private readonly connection: BunWebSocketConnectionContext) {}

  open(client: ServerWebSocket<unknown>): void {
    client.subscribe(this.connection.params.room!);
    client.send(JSON.stringify({ event: "open", connection: this.connection.scope.id, identity: this.connection.identity,
      dependency: this.dependency.label }));
  }

  message(client: ServerWebSocket<unknown>, message: string | Buffer, @Inject(BUN_WEBSOCKET_MESSAGE) context: BunWebSocketMessageContext): void {
    this.count++;
    context.scope.value(MESSAGE_RESOURCE, context.scope.id, { dispose: (id) => { console.log(`MESSAGE_DISPOSED ${id}`); } });
    const text = String(message);
    client.send(JSON.stringify({ event: "message", text, count: this.count, connection: this.connection.scope.id,
      messageScope: context.scope.id, identity: this.connection.identity }));
    if (text.startsWith("publish:")) client.publish(this.connection.params.room!, text.slice(8));
  }

  close(_client: ServerWebSocket<unknown>, _code: number, _reason: string): void {
    console.log(`SOCKET_CLOSED ${this.connection.scope.id}`);
  }
}
