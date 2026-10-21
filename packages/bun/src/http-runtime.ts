import {
  CONTROLLER_KIND,
  defineParameterResolver,
  executeMiddlewareChain,
  type ManagedMethodPlan,
  type MiddlewareConstructor,
  type RuntimeRegistry,
  type RuntimeRegistryConsumerContext,
} from "@bunwire/core";
import {
  BUN_HTTP_CONTEXT,
  BUN_HTTP_CONTEXT_RESOLVER_ID,
  BUN_HTTP_METHODS,
  BUN_HTTP_ROUTE_KIND,
  bunHttpCompiledRoute,
  type BunHttpContext,
  type BunHttpMethod,
  type BunHttpRequest,
  type BunHttpServer,
  type BunHttpServerOptions,
} from "./http.js";
import type { BunExecutionScopeManager } from "./execution-scopes.js";
import {
  BunDefaultHttpExceptionHandler,
  BunMethodNotAllowedException,
  BunNotFoundException,
  bunInternalServerError,
  createBunHttpExceptionContext,
  handleBunHttpException,
  type BunHttpExceptionHandler,
  type BunHttpMode,
} from "./exceptions.js";
import {
  createBunMiddlewareContext,
  createBunMiddlewareDefinitions,
  selectBunMiddleware,
  type BunMiddlewareRuntimeDefinition,
} from "./middleware.js";
import { BUN_COOKIES, BunCookieJar } from "./cookies.js";
import { BUN_CSRF_CONTEXT, type CsrfManager } from "./csrf.js";
import { BUN_SESSION, type SessionManager } from "./sessions.js";
import {
  BUN_AUTH_CONTEXT,
  BUN_AUTH_INITIALIZE,
  type AuthManager,
} from "./auth.js";
import {
  BUN_AUTHORIZATION_CONTEXT,
  type AuthorizationManager,
} from "./authorization.js";
import { BUN_OAUTH_CONTEXT, type OAuthManager } from "./oauth.js";
import type { BunRuntimeContext } from "./runtime.js";
import { BunPageResult, type BunPageManager } from "./pages.js";
import {
  resolveBunHttpResponse,
  type BunHttpResponseResolver,
} from "./response.js";
import { prepareBunFormRequestInput } from "./request-runtime.js";
import { bunNativeWebSocketHandler, consumeBunWebSocketRegistry, createBunWebSocketRuntimeState, upgradeBunWebSocket, type BunWebSocketOptions, type BunWebSocketRuntimeState } from "./websocket-runtime.js";

type NativeRouteHandler = (
  request: BunHttpRequest,
  server: BunHttpServer,
) => Response | undefined | Promise<Response | undefined>;

type NativeRouteMethods = Partial<Record<BunHttpMethod, NativeRouteHandler>>;

interface CompiledHttpRoute {
  readonly method: BunHttpMethod;
  readonly path: string;
  readonly plan: ManagedMethodPlan;
}

interface BunHttpPipeline {
  readonly mode: BunHttpMode;
  readonly responseResolvers: readonly BunHttpResponseResolver[];
  readonly exceptionHandler: BunHttpExceptionHandler;
}

export interface BunHttpRuntimeState {
  readonly routes: Map<string, Map<BunHttpMethod, CompiledHttpRoute>>;
  invocation: RuntimeRegistryConsumerContext<BunRuntimeContext> | undefined;
  server: BunHttpServer | undefined;
  middlewareDefinitions: ReadonlyMap<MiddlewareConstructor, BunMiddlewareRuntimeDefinition>;
  readonly websocket: BunWebSocketRuntimeState;
  socketHandler: ReturnType<typeof bunNativeWebSocketHandler> | undefined;
}

export function createBunHttpRuntimeState(websocketOptions?: BunWebSocketOptions): BunHttpRuntimeState {
  return {
    routes: new Map(),
    invocation: undefined,
    server: undefined,
    middlewareDefinitions: new Map(),
    websocket: createBunWebSocketRuntimeState(websocketOptions),
    socketHandler: undefined,
  };
}

function relevantPlans(registry: RuntimeRegistry): readonly ManagedMethodPlan[] {
  return registry.methods.filter((plan) => plan.kind === BUN_HTTP_ROUTE_KIND);
}

export function validateBunHttpMiddleware(
  state: BunHttpRuntimeState,
  registry: RuntimeRegistry,
): void {
  state.middlewareDefinitions = createBunMiddlewareDefinitions(
    registry,
    relevantPlans(registry),
  );
  for (const route of state.websocket.routes.values()) {
    for (const attachment of route.entry.middleware ?? []) {
      if (!state.middlewareDefinitions.has(attachment.target)) {
        throw new TypeError(`WebSocket route ${route.path} attaches unregistered middleware ${attachment.target.name}.`);
      }
    }
  }
}

function ownerEntry(registry: RuntimeRegistry, plan: ManagedMethodPlan) {
  return registry.classes.find((entry) => entry.target === plan.target);
}

export function consumeBunHttpRegistry(
  state: BunHttpRuntimeState,
  registry: RuntimeRegistry,
  invocation: RuntimeRegistryConsumerContext<BunRuntimeContext>,
): void {
  state.routes.clear();
  state.invocation = invocation;
  consumeBunWebSocketRegistry(state.websocket, registry, invocation);
  const identities = new Map<string, ManagedMethodPlan>();
  for (const plan of registry.methods) {
    if (plan.kind !== BUN_HTTP_ROUTE_KIND) continue;
    const owner = ownerEntry(registry, plan);
    if (!owner || owner.kind !== CONTROLLER_KIND || plan.ownerKind !== CONTROLLER_KIND) {
      throw new TypeError(
        `Bun HTTP route "${plan.target.name}.${String(plan.method)}" must belong to a canonical Core Controller registry entry.`,
      );
    }
    const compiled = bunHttpCompiledRoute({
      ownerKindId: owner.kind.id,
      ownerData: owner.data,
      methodData: plan.data,
      transportParameterCount: plan.parameters.filter((parameter) => (
        parameter.source === "transport"
      )).length,
    });
    const existing = identities.get(compiled.identity);
    if (existing) {
      throw new TypeError(
        `Duplicate Bun HTTP route "${compiled.method} ${compiled.path}" is declared by "${existing.target.name}.${String(existing.method)}" and "${plan.target.name}.${String(plan.method)}".`,
      );
    }
    identities.set(compiled.identity, plan);
    const methods = state.routes.get(compiled.path) ?? new Map();
    methods.set(compiled.method, Object.freeze({
      method: compiled.method,
      path: compiled.path,
      plan,
    }));
    state.routes.set(compiled.path, methods);
  }
}

function requestParams(request: BunHttpRequest): Readonly<Record<string, string>> {
  const params = typeof request.params === "object" && request.params !== null
    ? request.params
    : {};
  return Object.freeze({ ...params });
}

async function invokeRoute(
  route: CompiledHttpRoute,
  request: BunHttpRequest,
  server: BunHttpServer,
  manager: BunExecutionScopeManager,
  invocation: RuntimeRegistryConsumerContext<BunRuntimeContext>,
  state: BunHttpRuntimeState,
  pipeline: BunHttpPipeline,
  sessions?: SessionManager,
  csrfManager?: CsrfManager,
  authManager?: AuthManager,
  authorizationManager?: AuthorizationManager,
  oauthManager?: OAuthManager,
  pageManager?: BunPageManager,
): Promise<Response> {
  let httpContext: BunHttpContext | undefined;
  try {
    return await manager.run("http-request", async (scope) => {
      const cookies = new BunCookieJar(request, sessions ? [sessions.cookieName] : []);
      const lease = sessions ? await sessions.open(cookies) : undefined;
      let response: Response;
      try {
        const csrf = lease && csrfManager ? csrfManager.context(lease.session) : undefined;
        let context!: BunHttpContext;
        const auth = authManager?.createContext(() => context);
        const authorization = authorizationManager?.createContext(() => context, auth);
        const oauth = auth && lease && oauthManager
          ? oauthManager.createContext(() => context, auth, lease.session)
          : undefined;
        context = Object.freeze({
          request,
          server,
          route: Object.freeze({
            method: route.method,
            path: route.path,
            params: requestParams(request),
          }),
          scope,
          cookies,
          ...(lease ? { session: lease.session } : {}),
          ...(csrf ? { csrf } : {}),
          ...(auth ? { auth } : {}),
          ...(authorization ? { authorization } : {}),
          ...(oauth ? { oauth } : {}),
        });
        httpContext = context;
        scope.value(BUN_HTTP_CONTEXT, context);
        scope.value(BUN_COOKIES, cookies);
        if (lease) scope.value(BUN_SESSION, lease.session);
        if (csrf) scope.value(BUN_CSRF_CONTEXT, csrf);
        if (auth) scope.value(BUN_AUTH_CONTEXT, auth);
        if (authorization) scope.value(BUN_AUTHORIZATION_CONTEXT, authorization);
        if (oauth) scope.value(BUN_OAUTH_CONTEXT, oauth);
        if (auth) await auth[BUN_AUTH_INITIALIZE]();
        prepareBunFormRequestInput(context);
        const pathname = new URL(request.url).pathname;
        const attachments = selectBunMiddleware(
          route.plan,
          state.middlewareDefinitions,
          pathname,
          route.method,
        );
        const result = await invocation.invoke<unknown>(route.plan, [], {
          parentContainer: scope.container,
          around: (managedInvocation, next) => executeMiddlewareChain({
            invocation: managedInvocation,
            attachments,
            createContext: (attachment) => createBunMiddlewareContext(
              context,
              pathname,
              attachment,
            ),
            terminal: async () => resolveBunHttpResponse(
              await next(),
              context,
              pipeline.responseResolvers,
            ),
          }),
        });
        response = await resolveBunHttpResponse(result, context, pipeline.responseResolvers);
        if (pageManager) response = pageManager.finalize(response, context);
      } catch (error) {
        response = httpContext ? pageManager?.handleException(error, httpContext) ?? await handleBunHttpException(
          error,
          createBunHttpExceptionContext(request, server, pipeline.mode, httpContext),
          pipeline.exceptionHandler,
        ) : await handleBunHttpException(
          error,
          createBunHttpExceptionContext(request, server, pipeline.mode),
          pipeline.exceptionHandler,
        );
      }
      return lease ? await lease.commit(response) : cookies.apply(response);
    });
  } catch (error) {
    return handleBunHttpException(
      error,
      createBunHttpExceptionContext(request, server, pipeline.mode, httpContext),
      pipeline.exceptionHandler,
    );
  }
}

function nativeRoutes(
  state: BunHttpRuntimeState,
  manager: BunExecutionScopeManager,
  pipeline: BunHttpPipeline,
  sessions?: SessionManager,
  csrfManager?: CsrfManager,
  authManager?: AuthManager,
  authorizationManager?: AuthorizationManager,
  oauthManager?: OAuthManager,
  pageManager?: BunPageManager,
): Record<string, NativeRouteMethods> {
  const invocation = state.invocation;
  if (!invocation) {
    throw new TypeError("Bun HTTP routes cannot start before generated registry consumption.");
  }
  const routes: Record<string, NativeRouteMethods> = {};
  for (const [path, compiledMethods] of state.routes) {
    const allow = BUN_HTTP_METHODS.filter((method) => compiledMethods.has(method));
    const methods: NativeRouteMethods = {};
    for (const method of BUN_HTTP_METHODS) {
      const route = compiledMethods.get(method);
      methods[method] = route
        ? (request, server) => invokeRoute(
            route, request, server, manager, invocation, state, pipeline,
            sessions, csrfManager, authManager, authorizationManager, oauthManager, pageManager,
          )
        : (request, server) => handleBunHttpException(
            new BunMethodNotAllowedException(allow),
            createBunHttpExceptionContext(request, server, pipeline.mode),
            pipeline.exceptionHandler,
          );
    }
    routes[path] = methods;
  }
  for (const [path, socketRoute] of state.websocket.routes) {
    const methods = routes[path] ?? Object.fromEntries(BUN_HTTP_METHODS.map((method) => [method, (request: BunHttpRequest, server: BunHttpServer) => handleBunHttpException(
      new BunMethodNotAllowedException(["GET"]),
      createBunHttpExceptionContext(request, server, pipeline.mode), pipeline.exceptionHandler,
    )])) as NativeRouteMethods;
    methods.GET = (request, server) => upgradeBunWebSocket(
      state.websocket, socketRoute, request, server, manager, state.middlewareDefinitions, pipeline.mode, pipeline.exceptionHandler,
      sessions, csrfManager, authManager, authorizationManager, oauthManager,
    );
    routes[path] = methods;
  }
  return routes;
}

export async function startBunHttpServer(
  state: BunHttpRuntimeState,
  manager: BunExecutionScopeManager,
  options: BunHttpServerOptions,
  sessions?: SessionManager,
  csrfManager?: CsrfManager,
  authManager?: AuthManager,
  authorizationManager?: AuthorizationManager,
  oauthManager?: OAuthManager,
  pageManager?: BunPageManager,
): Promise<void> {
  const pipeline: BunHttpPipeline = Object.freeze({
    mode: options.mode ?? "production",
    responseResolvers: Object.freeze([
      ...(pageManager ? [{
        resolve: (value: unknown, context: BunHttpContext) => value instanceof BunPageResult
          ? pageManager.resolve(value, context)
          : undefined,
      }] : []),
      ...(options.responseResolvers ?? []),
    ]),
    exceptionHandler: options.exceptionHandler ?? new BunDefaultHttpExceptionHandler(),
  });
  const socketHandler = state.websocket.routes.size > 0
    ? bunNativeWebSocketHandler(state.websocket, manager) : undefined;
  state.socketHandler = socketHandler;
  const server = Bun.serve({
    ...(options.hostname === undefined ? {} : { hostname: options.hostname }),
    ...(options.port === undefined ? {} : { port: options.port }),
    routes: nativeRoutes(
      state, manager, pipeline, sessions, csrfManager,
      authManager, authorizationManager, oauthManager, pageManager,
    ),
    fetch: (request, server) => pageManager?.asset(request) ?? handleBunHttpException(
      new BunNotFoundException(),
      createBunHttpExceptionContext(request as BunHttpRequest, server as BunHttpServer, pipeline.mode),
      pipeline.exceptionHandler,
    ),
    error: () => bunInternalServerError(),
    ...(socketHandler ? { websocket: {
      open: socketHandler.open,
      message: socketHandler.message,
      drain: socketHandler.drain,
      close: socketHandler.close,
      ...(state.websocket.options.backpressureLimit === undefined ? {} : { backpressureLimit: state.websocket.options.backpressureLimit }),
    } } : {}),
  });
  state.server = server as BunHttpServer;
  await options.onServer?.(state.server);
}

export async function stopBunHttpServer(state: BunHttpRuntimeState): Promise<void> {
  const server = state.server;
  if (!server) return;
  state.server = undefined;
  const hadSockets = state.socketHandler !== undefined;
  await state.socketHandler?.shutdown();
  state.socketHandler = undefined;
  if (!hadSockets) { await server.stop(false); return; }
  const stop = server.stop(true);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([stop, new Promise<void>((resolve) => { timeout = setTimeout(resolve, 1000); })]);
  } finally { if (timeout) clearTimeout(timeout); }
}

export const bunHttpContextResolver = defineParameterResolver({
  id: BUN_HTTP_CONTEXT_RESOLVER_ID,
  resolve: ({ context }) => context.container.get(BUN_HTTP_CONTEXT),
});
