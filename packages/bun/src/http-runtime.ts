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
  createBunMiddlewareContext,
  createBunMiddlewareDefinitions,
  selectBunMiddleware,
  type BunMiddlewareRuntimeDefinition,
} from "./middleware.js";
import type { BunRuntimeContext } from "./runtime.js";

type NativeRouteHandler = (
  request: BunHttpRequest,
  server: BunHttpServer,
) => Response | Promise<Response>;

type NativeRouteMethods = Partial<Record<BunHttpMethod, NativeRouteHandler>>;

interface CompiledHttpRoute {
  readonly method: BunHttpMethod;
  readonly path: string;
  readonly plan: ManagedMethodPlan;
}

export interface BunHttpRuntimeState {
  readonly routes: Map<string, Map<BunHttpMethod, CompiledHttpRoute>>;
  invocation: RuntimeRegistryConsumerContext<BunRuntimeContext> | undefined;
  server: BunHttpServer | undefined;
  middlewareDefinitions: ReadonlyMap<MiddlewareConstructor, BunMiddlewareRuntimeDefinition>;
}

export function createBunHttpRuntimeState(): BunHttpRuntimeState {
  return {
    routes: new Map(),
    invocation: undefined,
    server: undefined,
    middlewareDefinitions: new Map(),
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

function textResponse(body: string, status: number, headers?: HeadersInit): Response {
  return new Response(body, {
    status,
    ...(headers === undefined ? {} : { headers }),
  });
}

function internalServerError(): Response {
  return textResponse("Internal Server Error", 500);
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
): Promise<Response> {
  try {
    const result = await manager.run("http-request", async (scope) => {
      const context: BunHttpContext = Object.freeze({
        request,
        server,
        route: Object.freeze({
          method: route.method,
          path: route.path,
          params: requestParams(request),
        }),
        scope,
      });
      scope.value(BUN_HTTP_CONTEXT, context);
      const pathname = new URL(request.url).pathname;
      const attachments = selectBunMiddleware(
        route.plan,
        state.middlewareDefinitions,
        pathname,
        route.method,
      );
      return invocation.invoke<unknown>(route.plan, [], {
        parentContainer: scope.container,
        around: (managedInvocation, next) => executeMiddlewareChain({
          invocation: managedInvocation,
          attachments,
          createContext: (attachment) => createBunMiddlewareContext(
            context,
            pathname,
            attachment,
          ),
          terminal: next,
        }),
      });
    });
    return result instanceof Response ? result : internalServerError();
  } catch {
    return internalServerError();
  }
}

function nativeRoutes(
  state: BunHttpRuntimeState,
  manager: BunExecutionScopeManager,
): Record<string, NativeRouteMethods> {
  const invocation = state.invocation;
  if (!invocation) {
    throw new TypeError("Bun HTTP routes cannot start before generated registry consumption.");
  }
  const routes: Record<string, NativeRouteMethods> = {};
  for (const [path, compiledMethods] of state.routes) {
    const allow = BUN_HTTP_METHODS.filter((method) => compiledMethods.has(method));
    const allowHeader = allow.join(", ");
    const methods: NativeRouteMethods = {};
    for (const method of BUN_HTTP_METHODS) {
      const route = compiledMethods.get(method);
      methods[method] = route
        ? (request, server) => invokeRoute(route, request, server, manager, invocation, state)
        : () => textResponse("Method Not Allowed", 405, { Allow: allowHeader });
    }
    routes[path] = methods;
  }
  return routes;
}

export async function startBunHttpServer(
  state: BunHttpRuntimeState,
  manager: BunExecutionScopeManager,
  options: BunHttpServerOptions,
): Promise<void> {
  const server = Bun.serve({
    ...(options.hostname === undefined ? {} : { hostname: options.hostname }),
    ...(options.port === undefined ? {} : { port: options.port }),
    routes: nativeRoutes(state, manager),
    fetch: () => textResponse("Not Found", 404),
  });
  state.server = server as BunHttpServer;
  await options.onServer?.(state.server);
}

export async function stopBunHttpServer(state: BunHttpRuntimeState): Promise<void> {
  const server = state.server;
  if (!server) return;
  state.server = undefined;
  await server.stop(false);
}

export const bunHttpContextResolver = defineParameterResolver({
  id: BUN_HTTP_CONTEXT_RESOLVER_ID,
  resolve: ({ context }) => context.container.get(BUN_HTTP_CONTEXT),
});
