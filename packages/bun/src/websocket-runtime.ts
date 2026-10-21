import {
  executeMiddlewareChain,
  type ManagedClassRegistryEntry,
  type ManagedMethodPlan,
  type RuntimeRegistry,
  type RuntimeRegistryConsumerContext,
} from "@bunwire/core";
import type { ServerWebSocket } from "bun";
import { BUN_AUTH_CONTEXT, BUN_AUTH_INITIALIZE, type AuthManager } from "./auth.js";
import { BUN_AUTHORIZATION_CONTEXT, type AuthorizationManager } from "./authorization.js";
import { BUN_COOKIES, BunCookieJar } from "./cookies.js";
import { BUN_CSRF_CONTEXT, type CsrfManager } from "./csrf.js";
import type { BunExecutionScope, BunExecutionScopeManager } from "./execution-scopes.js";
import { BUN_HTTP_CONTEXT, bunHttpCompiledRoute, type BunHttpContext, type BunHttpRequest, type BunHttpServer } from "./http.js";
import { createBunMiddlewareContext, selectBunMiddleware, type BunMiddlewareRuntimeDefinition } from "./middleware.js";
import { BUN_OAUTH_CONTEXT, type OAuthManager } from "./oauth.js";
import { BUN_SESSION, type SessionManager } from "./sessions.js";
import {
  BUN_WEBSOCKET_CLOSE_KIND,
  BUN_WEBSOCKET_CONNECTION,
  BUN_WEBSOCKET_DRAIN_KIND,
  BUN_WEBSOCKET_KIND,
  BUN_WEBSOCKET_MESSAGE,
  BUN_WEBSOCKET_MESSAGE_KIND,
  BUN_WEBSOCKET_OPEN_KIND,
  bunWebSocketRouteIdentity,
  type BunWebSocketConnectionContext,
  type BunWebSocketMessageContext,
} from "./websocket.js";
import type { BunRuntimeContext } from "./runtime.js";
import { BunDefaultHttpExceptionHandler, createBunHttpExceptionContext, handleBunHttpException,
  type BunHttpExceptionHandler, type BunHttpMode } from "./exceptions.js";

export type BunWebSocketIdentity = null | boolean | number | string | readonly BunWebSocketIdentity[] | { readonly [key: string]: BunWebSocketIdentity };

export interface BunWebSocketOptions<Principal = unknown> {
  /** Called while the authorized HTTP request scope is still alive. */
  readonly mapIdentity?: (context: BunHttpContext<Principal>) => BunWebSocketIdentity | undefined | Promise<BunWebSocketIdentity | undefined>;
  readonly shutdownGraceMs?: number;
  readonly backpressureLimit?: number;
}

interface SocketRoute {
  readonly path: string;
  readonly entry: ManagedClassRegistryEntry;
  readonly methods: ReadonlyMap<string, ManagedMethodPlan>;
}

interface PendingConnection {
  readonly route: SocketRoute;
  readonly identity: BunWebSocketIdentity | undefined;
  readonly params: Readonly<Record<string, string>>;
}

interface ActiveConnection extends PendingConnection {
  readonly id: number;
  readonly socket: ServerWebSocket<{ readonly id: number }>;
  readonly scope: BunExecutionScope;
  readonly context: BunWebSocketConnectionContext;
  ready: Promise<void>;
  readonly messages: Set<Promise<void>>;
  closing?: Promise<void>;
}

export interface BunWebSocketRuntimeState {
  readonly routes: Map<string, SocketRoute>;
  readonly pending: Map<number, PendingConnection>;
  readonly connections: Map<number, ActiveConnection>;
  invocation: RuntimeRegistryConsumerContext<BunRuntimeContext> | undefined;
  nextId: number;
  closing: boolean;
  readonly options: BunWebSocketOptions;
}

export function createBunWebSocketRuntimeState(options: BunWebSocketOptions = {}): BunWebSocketRuntimeState {
  return { routes: new Map(), pending: new Map(), connections: new Map(), invocation: undefined, nextId: 1, closing: false, options };
}

/** @internal Copy only durable JSON identity data across the HTTP/connection scope boundary. */
export function snapshotBunWebSocketIdentity(value: unknown, seen = new Set<object>()): BunWebSocketIdentity | undefined {
  if (value === undefined || value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object") throw new TypeError("WebSocket identity must contain only JSON values.");
  if (seen.has(value)) throw new TypeError("WebSocket identity cannot contain cycles.");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError("WebSocket identity arrays must be plain arrays.");
      const copy: BunWebSocketIdentity[] = [];
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor)) throw new TypeError("WebSocket identity arrays cannot contain holes or getters.");
        const snapshot = snapshotBunWebSocketIdentity(descriptor.value, seen);
        if (snapshot === undefined) throw new TypeError("WebSocket identity arrays cannot contain undefined.");
        copy.push(snapshot);
      }
      return Object.freeze(copy);
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new TypeError("WebSocket identity must use plain objects, not request-scoped instances.");
    }
    const record: Record<string, BunWebSocketIdentity> = {};
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) throw new TypeError("WebSocket identity cannot contain getters.");
      const snapshot = snapshotBunWebSocketIdentity(descriptor.value, seen);
      if (snapshot !== undefined) Object.defineProperty(record, key, { value: snapshot, enumerable: true });
    }
    return Object.freeze(record);
  } finally { seen.delete(value); }
}

export function consumeBunWebSocketRegistry(
  state: BunWebSocketRuntimeState,
  registry: RuntimeRegistry,
  invocation: RuntimeRegistryConsumerContext<BunRuntimeContext>,
): void {
  state.routes.clear();
  state.invocation = invocation;
  const identities = new Set<string>();
  for (const entry of registry.classes) {
    if (entry.kind !== BUN_WEBSOCKET_KIND) continue;
    const compiled = bunWebSocketRouteIdentity(entry.data);
    if (identities.has(compiled.identity)) throw new TypeError(`Duplicate Bun WebSocket route ${compiled.path}.`);
    identities.add(compiled.identity);
    const methods = new Map<string, ManagedMethodPlan>();
    for (const plan of registry.methods) {
      if (plan.target !== entry.target) continue;
      if (plan.ownerKind !== BUN_WEBSOCKET_KIND || ![BUN_WEBSOCKET_OPEN_KIND, BUN_WEBSOCKET_MESSAGE_KIND, BUN_WEBSOCKET_CLOSE_KIND, BUN_WEBSOCKET_DRAIN_KIND].some((kind) => kind === plan.kind)) {
        throw new TypeError(`WebSocket ${entry.target.name} contains an unsupported managed method.`);
      }
      const expected = plan.kind === BUN_WEBSOCKET_CLOSE_KIND ? 3 : plan.kind === BUN_WEBSOCKET_MESSAGE_KIND ? 2 : 1;
      if (plan.parameters.filter((parameter) => parameter.source === "transport").length !== expected || plan.middleware.length > 0) {
        throw new TypeError(`WebSocket ${entry.target.name}.${String(plan.method)} requires ${expected} native arguments and no lifecycle middleware.`);
      }
      methods.set(String(plan.method), plan);
    }
    if (!methods.has("message")) throw new TypeError(`WebSocket ${entry.target.name} requires message().`);
    state.routes.set(compiled.path, Object.freeze({ path: compiled.path, entry, methods }));
  }
  for (const route of state.routes.values()) {
    const pattern = bunWebSocketRouteIdentity(route.entry.data).identity;
    for (const plan of registry.methods) {
      if (plan.kind.id !== "bun.http-route") continue;
      const owner = registry.classes.find((entry) => entry.target === plan.target);
      if (!owner) continue;
      if (bunHttpCompiledRoute({ ownerKindId: owner.kind.id, ownerData: owner.data, methodData: plan.data,
        transportParameterCount: plan.parameters.filter((item) => item.source === "transport").length }).identity === pattern) {
        throw new TypeError(`WebSocket route ${route.path} conflicts with an HTTP GET route.`);
      }
    }
  }
}

function params(request: BunHttpRequest): Readonly<Record<string, string>> {
  return Object.freeze({ ...(request.params ?? {}) });
}

export async function upgradeBunWebSocket(
  state: BunWebSocketRuntimeState,
  route: SocketRoute,
  request: BunHttpRequest,
  server: BunHttpServer,
  manager: BunExecutionScopeManager,
  definitions: ReadonlyMap<import("@bunwire/core").MiddlewareConstructor, BunMiddlewareRuntimeDefinition>,
  mode: BunHttpMode = "production",
  exceptionHandler: BunHttpExceptionHandler = new BunDefaultHttpExceptionHandler(),
  sessions?: SessionManager,
  csrfManager?: CsrfManager,
  authManager?: AuthManager,
  authorizationManager?: AuthorizationManager,
  oauthManager?: OAuthManager,
): Promise<Response | undefined> {
  if (state.closing) return new Response("Server shutting down", { status: 503 });
  const invocation = state.invocation;
  if (!invocation) throw new TypeError("WebSocket registry has not been consumed.");
  try { return await manager.run("http-request", async (scope) => {
    const cookies = new BunCookieJar(request, sessions ? [sessions.cookieName] : []);
    const lease = sessions ? await sessions.open(cookies) : undefined;
    let context: BunHttpContext | undefined;
    try {
      const csrf = lease && csrfManager ? csrfManager.context(lease.session) : undefined;
      const auth = authManager?.createContext(() => context!);
      const authorization = authorizationManager?.createContext(() => context!, auth);
      const oauth = auth && lease && oauthManager ? oauthManager.createContext(() => context!, auth, lease.session) : undefined;
      context = Object.freeze({ request, server, route: Object.freeze({ method: "GET" as const, path: route.path, params: params(request) }),
        scope, cookies, ...(lease ? { session: lease.session } : {}), ...(csrf ? { csrf } : {}), ...(auth ? { auth } : {}),
        ...(authorization ? { authorization } : {}), ...(oauth ? { oauth } : {}) });
      scope.value(BUN_HTTP_CONTEXT, context).value(BUN_COOKIES, cookies);
      if (lease) scope.value(BUN_SESSION, lease.session);
      if (csrf) scope.value(BUN_CSRF_CONTEXT, csrf);
      if (auth) scope.value(BUN_AUTH_CONTEXT, auth);
      if (authorization) scope.value(BUN_AUTHORIZATION_CONTEXT, authorization);
      if (oauth) scope.value(BUN_OAUTH_CONTEXT, oauth);
      if (auth) await auth[BUN_AUTH_INITIALIZE]();
      const marker = new Response(null, { status: 204 });
      const pathname = new URL(request.url).pathname;
      const attachments = selectBunMiddleware({ middleware: route.entry.middleware ?? [] }, definitions, pathname, "GET");
      const result = await invocation.application.runInvocation(() => marker, {
        parentContainer: scope.container,
        around: (managedInvocation, next) => executeMiddlewareChain({
          invocation: managedInvocation, attachments,
          createContext: (attachment) => createBunMiddlewareContext(context!, pathname, attachment),
          terminal: next,
        }),
      });
      if (result !== marker) return lease ? lease.commit(result) : cookies.apply(result);
      const identity = snapshotBunWebSocketIdentity(await state.options.mapIdentity?.(context));
      const handshake = lease ? await lease.commit(marker) : cookies.apply(marker);
      if (state.closing) return new Response("Server shutting down", { status: 503 });
      const id = state.nextId++;
      state.pending.set(id, { route, identity, params: context.route.params });
      let upgraded: boolean;
      try { upgraded = server.upgrade(request, { data: { id }, headers: handshake.headers }); }
      catch (error) { state.pending.delete(id); throw error; }
      if (!upgraded) {
        state.pending.delete(id);
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    } catch (error) {
      const response = await handleBunHttpException(error,
        createBunHttpExceptionContext(request, server, mode, context), exceptionHandler);
      return lease ? lease.commit(response) : cookies.apply(response);
    } finally { lease?.release(); }
  }); } catch (error) {
    return handleBunHttpException(error, createBunHttpExceptionContext(request, server, mode), exceptionHandler);
  }
}

export function bunNativeWebSocketHandler(state: BunWebSocketRuntimeState, manager: BunExecutionScopeManager) {
  const report = (error: unknown): void => { console.error("Bun WebSocket handler failed.", error); };
  const invoke = async (connection: ActiveConnection, name: string, args: readonly unknown[], parent = connection.scope): Promise<void> => {
    const plan = connection.route.methods.get(name);
    if (plan) await state.invocation!.invoke(plan, args, { parentContainer: parent.container });
  };
  const finalize = async (connection: ActiveConnection, code: number, reason: string): Promise<void> => {
    if (connection.closing) return connection.closing;
    connection.closing = (async () => {
      try { await connection.ready; } catch { /* open failure already reported */ }
      await Promise.allSettled([...connection.messages]);
      try { await invoke(connection, "close", [connection.socket, code, reason]); } catch (error) { report(error); }
      try { await connection.scope.dispose(); } catch (error) { report(error); }
      state.connections.delete(connection.id);
    })();
    return connection.closing;
  };
  return {
    open(ws: ServerWebSocket<{ readonly id: number }>): void {
      const pending = state.pending.get(ws.data.id);
      state.pending.delete(ws.data.id);
      if (!pending || state.closing) { ws.close(1001, "Server shutting down"); return; }
      let scope: BunExecutionScope | undefined;
      try {
        scope = manager.create("websocket-connection");
        const context: BunWebSocketConnectionContext = Object.freeze({ id: ws.data.id, socket: ws, path: pending.route.path,
          params: pending.params, identity: pending.identity, scope });
        scope.value(BUN_WEBSOCKET_CONNECTION, context);
        const target = pending.route.entry.target;
        scope.scoped(target, () => new target(...pending.route.entry.dependencies.map((dependency) => scope!.resolve(dependency.token))));
        const connection: ActiveConnection = { ...pending, id: ws.data.id, socket: ws, scope, context,
          ready: Promise.resolve(), messages: new Set() };
        state.connections.set(connection.id, connection);
        connection.ready = invoke(connection, "open", [ws]).catch((error) => { report(error); ws.close(1011, "WebSocket open failed"); });
      } catch (error) {
        report(error);
        if (scope) void scope.dispose().catch(report);
        ws.close(1011, "WebSocket initialization failed");
      }
    },
    async message(ws: ServerWebSocket<{ readonly id: number }>, message: string | Buffer): Promise<void> {
      const connection = state.connections.get(ws.data.id);
      if (!connection || connection.closing || state.closing) return;
      const work = (async () => {
        await connection.ready;
        await manager.run("websocket-message", async (scope) => {
          const context: BunWebSocketMessageContext = Object.freeze({ connection: connection.context, message, scope });
          scope.value(BUN_WEBSOCKET_MESSAGE, context);
          await invoke(connection, "message", [ws, message], scope);
        }, { parent: connection.scope });
      })();
      connection.messages.add(work);
      try { await work; } catch (error) { report(error); ws.close(1011, "WebSocket message failed"); }
      finally { connection.messages.delete(work); }
    },
    async drain(ws: ServerWebSocket<{ readonly id: number }>): Promise<void> {
      const connection = state.connections.get(ws.data.id);
      if (!connection || connection.closing) return;
      try { await connection.ready; await invoke(connection, "drain", [ws]); } catch (error) { report(error); ws.close(1011, "WebSocket drain failed"); }
    },
    async close(ws: ServerWebSocket<{ readonly id: number }>, code: number, reason: string): Promise<void> {
      const connection = state.connections.get(ws.data.id);
      if (connection) await finalize(connection, code, reason);
    },
    async shutdown(): Promise<void> {
      state.closing = true;
      for (const connection of state.connections.values()) connection.socket.close(1001, "Server shutting down");
      const grace = state.options.shutdownGraceMs ?? 5000;
      if (state.connections.size > 0) {
        await new Promise<void>((resolve) => {
          const finish = (): void => { clearInterval(check); clearTimeout(timeout); resolve(); };
          const check = setInterval(() => { if (state.connections.size === 0) finish(); }, 10);
          const timeout = setTimeout(finish, grace);
        });
      }
      for (const connection of [...state.connections.values()]) {
        connection.socket.terminate();
        await finalize(connection, 1001, "Server shutting down");
      }
      state.pending.clear();
    },
  };
}
