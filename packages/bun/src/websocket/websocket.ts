import {
  createToken,
  defineClassKind,
  defineCompilerMetadataHandler,
  defineManagedClassDecorator,
  defineMethodKind,
  type ManagedClassCompilationHandlerData,
  type Token,
} from "@bunwire/core";
import type { ServerWebSocket } from "bun";
import type { BunExecutionScope } from "../foundation/execution-scopes.js";
import { BUN_HTTP_ROUTE_KIND, bunHttpCompiledRoute, bunHttpRouteConflictIdentity, normalizeBunHttpPath } from "../http/http.js";

export interface BunWebSocketDefinition { readonly path: string }
export interface BunWebSocketConnectionContext<Identity = unknown> {
  readonly id: number;
  readonly socket: ServerWebSocket<unknown>;
  readonly path: string;
  readonly params: Readonly<Record<string, string>>;
  readonly identity: Identity | undefined;
  readonly scope: BunExecutionScope;
}
export interface BunWebSocketMessageContext<Identity = unknown> {
  readonly connection: BunWebSocketConnectionContext<Identity>;
  readonly message: string | Buffer;
  readonly scope: BunExecutionScope;
}

export const BUN_WEBSOCKET_CONNECTION: Token<BunWebSocketConnectionContext> =
  createToken<BunWebSocketConnectionContext>("bunwire.bun.websocket-connection");
export const BUN_WEBSOCKET_MESSAGE: Token<BunWebSocketMessageContext> =
  createToken<BunWebSocketMessageContext>("bunwire.bun.websocket-message");

export const BUN_WEBSOCKET_KIND = defineClassKind({
  id: "bun.websocket", injectable: true, autoDiscover: true, analyzeConstructor: true,
  managedMethods: true, registry: true,
});
export const BUN_WEBSOCKET_OPEN_KIND = defineMethodKind({ id: "bun.websocket.open", allowedOn: [BUN_WEBSOCKET_KIND], invocable: true });
export const BUN_WEBSOCKET_MESSAGE_KIND = defineMethodKind({ id: "bun.websocket.message", allowedOn: [BUN_WEBSOCKET_KIND], invocable: true });
export const BUN_WEBSOCKET_CLOSE_KIND = defineMethodKind({ id: "bun.websocket.close", allowedOn: [BUN_WEBSOCKET_KIND], invocable: true });
export const BUN_WEBSOCKET_DRAIN_KIND = defineMethodKind({ id: "bun.websocket.drain", allowedOn: [BUN_WEBSOCKET_KIND], invocable: true });

function socketMetadata(path: string): BunWebSocketDefinition {
  if (typeof path !== "string" || !path.startsWith("/")) throw new TypeError("@WebSocket requires an absolute path.");
  return Object.freeze({ path: normalizeBunHttpPath(undefined, path) });
}

export const WebSocket = defineManagedClassDecorator<string, BunWebSocketDefinition, "bun.websocket-decorator">({
  id: "bun.websocket-decorator",
  kind: BUN_WEBSOCKET_KIND,
  compilerSymbol: { moduleSpecifier: "@bunwire/bun", exportName: "WebSocket" },
  bare: false,
  createMetadata: socketMetadata,
  validateTarget(target) {
    if (typeof Object.getOwnPropertyDescriptor(target.prototype, "message")?.value !== "function") {
      throw new TypeError("@WebSocket requires an own message() method.");
    }
  },
});

const methodKinds = [
  ["open", BUN_WEBSOCKET_OPEN_KIND, true],
  ["message", BUN_WEBSOCKET_MESSAGE_KIND, false],
  ["close", BUN_WEBSOCKET_CLOSE_KIND, true],
  ["drain", BUN_WEBSOCKET_DRAIN_KIND, true],
] as const;

export const BUN_WEBSOCKET_COMPILATION_HANDLER = defineCompilerMetadataHandler({
  id: "bun.websocket-compilation",
  data: Object.freeze({
    type: "bunwire.managed-class-compilation" as const,
    classKindIds: Object.freeze([BUN_WEBSOCKET_KIND.id]),
    scope: "transient" as const,
    properties: Object.freeze([]),
    classMiddleware: true,
    compileMetadata: (data: unknown) => socketMetadata((data as BunWebSocketDefinition).path),
    intrinsicMethods: Object.freeze(methodKinds.map(([name, kind, optional]) => Object.freeze({
      name, kind, optional, parameters: "mixed" as const,
      compilerSymbol: Object.freeze({ moduleSpecifier: "@bunwire/bun", exportName: ({
        open: "BUN_WEBSOCKET_OPEN_KIND", message: "BUN_WEBSOCKET_MESSAGE_KIND",
        close: "BUN_WEBSOCKET_CLOSE_KIND", drain: "BUN_WEBSOCKET_DRAIN_KIND",
      } as const)[name] }),
    }))),
  } satisfies ManagedClassCompilationHandlerData),
});

interface RouteIdentityInput {
  readonly ownerKindId: string;
  readonly ownerData: unknown;
  readonly methodKindId: string;
  readonly methodData: unknown;
  readonly transportParameterCount: number;
}

export function bunWebSocketRouteIdentity(data: unknown): { readonly path: string; readonly identity: string } {
  const path = socketMetadata((data as BunWebSocketDefinition).path).path;
  return Object.freeze({ path, identity: `GET\0${bunHttpRouteConflictIdentity(path)}` });
}

export const BUN_WEBSOCKET_ROUTE_IDENTITY_HANDLER = defineCompilerMetadataHandler({
  id: "bun.websocket-route-identity",
  data: Object.freeze({
    type: "bunwire.managed-method-identity" as const,
    methodKindIds: Object.freeze([BUN_HTTP_ROUTE_KIND.id, ...methodKinds.map(([, kind]) => kind.id)]),
    resolveIdentity(input: RouteIdentityInput): string {
      if (input.methodKindId === BUN_HTTP_ROUTE_KIND.id) return bunHttpCompiledRoute(input).identity;
      const expected = input.methodKindId === BUN_WEBSOCKET_CLOSE_KIND.id ? 3 : input.methodKindId === BUN_WEBSOCKET_MESSAGE_KIND.id ? 2 : 1;
      if (input.ownerKindId !== BUN_WEBSOCKET_KIND.id || input.transportParameterCount !== expected) {
        throw new TypeError(`WebSocket ${input.methodKindId.split(".").at(-1)}() must declare exactly ${expected} transport parameters.`);
      }
      const route = bunWebSocketRouteIdentity(input.ownerData);
      return input.methodKindId === BUN_WEBSOCKET_MESSAGE_KIND.id
        ? route.identity : `${input.methodKindId}\0${bunHttpRouteConflictIdentity(route.path)}`;
    },
  }),
});

export const BUN_WEBSOCKET_NO_CALLER_CONTRACT_HANDLER = defineCompilerMetadataHandler({
  id: "bun.websocket-no-caller-contract",
  data: Object.freeze({
    type: "bunwire.no-caller-contract" as const,
    methodKindIds: Object.freeze(methodKinds.map(([, kind]) => kind.id)),
  }),
});
