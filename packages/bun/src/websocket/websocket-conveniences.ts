import { createToken, type Token } from "@bunwire/core";
import type { ServerWebSocket } from "bun";
import type { BunWebSocketIdentity } from "./websocket-runtime.js";

export type BunWebSocketFrame = Parameters<ServerWebSocket<unknown>["send"]>[0];
export type BunWebSocketDelivery =
  | { readonly status: "sent"; readonly bytes: number }
  | { readonly status: "backpressure" | "dropped" | "missing" };

export interface BunWebSocketChannelAuthorization {
  readonly channel: string;
  readonly identity: BunWebSocketIdentity | undefined;
  readonly connection: Readonly<{ id: number; path: string; params: Readonly<Record<string, string>> }>;
}

export interface BunWebSocketChannels {
  join(channel: string): Promise<boolean>;
  leave(channel: string): boolean;
  send(connectionId: number, data: BunWebSocketFrame): BunWebSocketDelivery;
  broadcast(channel: string, data: BunWebSocketFrame): BunWebSocketDelivery;
}

export const BUN_WEBSOCKET_CHANNELS: Token<BunWebSocketChannels> =
  createToken<BunWebSocketChannels>("bunwire.bun.websocket-channels");

export function bunWebSocketDelivery(status: number): BunWebSocketDelivery {
  return status > 0 ? { status: "sent", bytes: status } : { status: status === -1 ? "backpressure" : "dropped" };
}

export class BunWebSocketMalformedMessageError extends Error {
  constructor(message = "Malformed WebSocket message") {
    super(message);
    this.name = "BunWebSocketMalformedMessageError";
  }
}

export type BunWebSocketPayloadValidator<Value> = (value: unknown) => value is Value;
type Validators = Readonly<Record<string, BunWebSocketPayloadValidator<unknown>>>;
type Payload<Validator> = Validator extends BunWebSocketPayloadValidator<infer Value> ? Value : never;
type Decoded<Definitions extends Validators> = {
  [Kind in keyof Definitions & string]: Readonly<{ type: Kind; payload: Payload<Definitions[Kind]> }>;
}[keyof Definitions & string];

/** Defines an opt-in text JSON envelope codec; validators are supplied by the application. */
export function defineBunWebSocketMessages<const Definitions extends Validators>(definitions: Definitions): {
  decode(raw: string | Buffer): Decoded<Definitions>;
  encode<Kind extends keyof Definitions & string>(type: Kind, payload: Payload<Definitions[Kind]>): string;
} {
  if (!definitions || typeof definitions !== "object" || Array.isArray(definitions) || Object.keys(definitions).length === 0) {
    throw new TypeError("WebSocket messages require at least one named validator.");
  }
  const validators = Object.assign(Object.create(null) as Record<string, BunWebSocketPayloadValidator<unknown>>, definitions);
  for (const [name, validate] of Object.entries(validators)) {
    if (!name || typeof validate !== "function") throw new TypeError("WebSocket message types require named validator functions.");
  }
  return Object.freeze({
    decode(raw: string | Buffer): Decoded<Definitions> {
      if (typeof raw !== "string") throw new BunWebSocketMalformedMessageError("Expected a text WebSocket message.");
      let value: unknown;
      try { value = JSON.parse(raw); }
      catch { throw new BunWebSocketMalformedMessageError("Invalid JSON WebSocket message."); }
      if (typeof value !== "object" || value === null || Array.isArray(value)
        || Object.keys(value).length !== 2 || !Object.hasOwn(value, "type") || !Object.hasOwn(value, "payload")) {
        throw new BunWebSocketMalformedMessageError("Expected a { type, payload } WebSocket envelope.");
      }
      const envelope = value as { type: unknown; payload: unknown };
      if (typeof envelope.type !== "string" || !Object.hasOwn(validators, envelope.type)
        || !validators[envelope.type]!(envelope.payload)) {
        throw new BunWebSocketMalformedMessageError("Unknown WebSocket message type or invalid payload.");
      }
      return value as Decoded<Definitions>;
    },
    encode<Kind extends keyof Definitions & string>(type: Kind, payload: Payload<Definitions[Kind]>): string {
      if (!Object.hasOwn(validators, type) || !validators[type]!(payload)) {
        throw new TypeError("Unknown WebSocket message type or invalid payload.");
      }
      const encoded = JSON.stringify({ type, payload });
      const roundTrip = JSON.parse(encoded) as { payload?: unknown };
      if (!Object.hasOwn(roundTrip, "payload") || !validators[type]!(roundTrip.payload)) {
        throw new TypeError("WebSocket message payload must survive JSON encoding.");
      }
      return encoded;
    },
  });
}
