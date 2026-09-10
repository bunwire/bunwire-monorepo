import {
  Adapter,
  defineAdapterValidationHook,
  defineRuntimeRegistryConsumer,
  type AdapterHostContext,
  type AdapterPreparationContext,
  type Application,
} from "@bunwire/core";
import { BUN_COMPILER_DESCRIPTOR } from "./definitions.js";
import { BUN_QUEUE_MANAGER, QueueManager, validateQueueOptions, type BunQueueOptions } from "./queue-manager.js";
import { BUN_QUEUE_WORKER, assertWorkerDriver, workerOptions, type QueueWorker } from "./queue-worker.js";
import { snapshotEventCodecs } from "./queue-event-codec.js";
import {
  BunExecutionScopeManager,
} from "./execution-scopes.js";
import {
  bunHttpContextResolver,
  consumeBunHttpRegistry,
  createBunHttpRuntimeState,
  startBunHttpServer,
  stopBunHttpServer,
  validateBunHttpMiddleware,
  type BunHttpRuntimeState,
} from "./http-runtime.js";
import type { BunHttpServerOptions } from "./http.js";
import { bunHttpCompiledRoute, BUN_HTTP_ROUTE_KIND } from "./http.js";
import { BUN_CSRF_MANAGER, CsrfManager, CsrfMiddleware, validateBunCsrfOptions } from "./csrf.js";
import { BUN_SESSION_MANAGER, SessionManager, validateBunSessionOptions } from "./sessions.js";
import {
  BUN_AUTH_MANAGER,
  AuthManager,
  AuthenticateMiddleware,
  GuestMiddleware,
  validateBunAuthenticationOptions,
  type BunAuthenticationOptions,
} from "./auth.js";
import {
  BUN_AUTHORIZATION_MANAGER,
  AuthorizationManager,
  AuthorizeMiddleware,
  validateBunAuthorizationOptions,
  type BunAuthorizationOptions,
} from "./authorization.js";
import { BUN_OAUTH_MANAGER, OAuthManager, validateBunOAuthOptions } from "./oauth.js";
import { BUN_PAGE_MANAGER, BunPageManager } from "./pages.js";
import {
  consumeBunFormRequestRegistry,
  createBunFormRequestResolver,
  createBunFormRequestRuntimeState,
  type BunFormRequestRuntimeState,
} from "./request-runtime.js";
import { BUN_SCHEDULER, BunScheduler, normalizeSchedulerOptions, type BunSchedulerOptions } from "./scheduler.js";
import { BUN_COMMAND_RUNTIME, BunCommandRuntime, bunCommandArgumentResolver, bunCommandFlagResolver, bunCommandOptionResolver } from "./command-runtime.js";

export type BunRuntimeRole = "http" | "worker" | "scheduler" | "command";

export interface BunAdapterOptions<Principal = unknown> {
  readonly queues?: BunQueueOptions;
  readonly role?: BunRuntimeRole;
  readonly handleSignals?: boolean;
  readonly http?: BunHttpServerOptions<Principal>;
  readonly scheduler?: BunSchedulerOptions;
}

export interface BunRuntimeContext {
  readonly role: BunRuntimeRole;
}

interface BunRuntimeState {
  worker: QueueWorker | undefined;
  scheduler: BunScheduler | undefined;
  commandRuntime: BunCommandRuntime | undefined;
  queueManager: QueueManager;
  registryConsumed: boolean;
  scopeManager: BunExecutionScopeManager;
  http: BunHttpRuntimeState;
  requests: BunFormRequestRuntimeState;
  signal: BunShutdownSignal | undefined;
  signalHandlers: ReadonlyMap<BunShutdownSignal, () => void> | undefined;
  sessionManager: SessionManager | undefined;
  csrfManager: CsrfManager | undefined;
  authManager: AuthManager | undefined;
  authorizationManager: AuthorizationManager | undefined;
  oauthManager: OAuthManager | undefined;
  pageManager: BunPageManager | undefined;
}

type BunShutdownSignal = "SIGINT" | "SIGTERM";

interface BunSignalProcess {
  readonly pid: number;
  on(signal: BunShutdownSignal, handler: () => void): void;
  off(signal: BunShutdownSignal, handler: () => void): void;
  kill(pid: number, signal: BunShutdownSignal): boolean;
}

const signalProcess = process as unknown as BunSignalProcess;

const RUNTIME_ROLES = new Set<BunRuntimeRole>([
  "http",
  "worker",
  "scheduler",
  "command",
]);

const runtimeStates = new WeakMap<BunRuntimeContext, BunRuntimeState>();

export class BunAdapterError extends Error {
  override readonly name = "BunAdapterError";
}

function stateFor(context: BunRuntimeContext): BunRuntimeState {
  const state = runtimeStates.get(context);
  if (!state) {
    throw new BunAdapterError("Bun runtime context has not been prepared by BunAdapter.");
  }
  return state;
}

const bunFormRequestResolver = createBunFormRequestResolver((context) => {
  if (typeof context !== "object" || context === null) {
    throw new BunAdapterError("Bun Form Request resolution requires the active Bun runtime context.");
  }
  return stateFor(context as BunRuntimeContext).requests;
});

function removeSignalHandlers(state: BunRuntimeState): void {
  if (!state.signalHandlers) return;
  for (const [signal, handler] of state.signalHandlers) {
    signalProcess.off(signal, handler);
  }
  state.signalHandlers = undefined;
}

function terminateWithSignal(signal: BunShutdownSignal, state: BunRuntimeState): void {
  removeSignalHandlers(state);
  signalProcess.kill(signalProcess.pid, signal);
}

function installSignalHandlers(
  application: Application<BunRuntimeContext>,
  state: BunRuntimeState,
): void {
  const handlers = new Map<BunShutdownSignal, () => void>();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    const handler = (): void => {
      if (state.signal) {
        terminateWithSignal(signal, state);
        return;
      }
      state.signal = signal;
      void application.stop().then(
        () => terminateWithSignal(signal, state),
        (error: unknown) => {
          removeSignalHandlers(state);
          console.error(`Bunwire graceful shutdown failed after ${signal}.`, error);
          process.exit(1);
        },
      );
    };
    handlers.set(signal, handler);
    signalProcess.on(signal, handler);
  }
  state.signalHandlers = handlers;
}

const bunRegistryConsumer = defineRuntimeRegistryConsumer<"bun.registry", BunRuntimeContext>({
  id: "bun.registry",
  consume(registry, context): void {
    const state = stateFor(context.applicationContext);
    consumeBunHttpRegistry(state.http, registry, context);
    consumeBunFormRequestRegistry(state.requests, registry);
    state.queueManager.consume(registry);
    state.scheduler?.consume(registry);
    state.commandRuntime?.consume(registry, context);
    state.registryConsumed = true;
  },
});

const bunValidationHook = defineAdapterValidationHook<"bun.validate", BunRuntimeContext>({
  id: "bun.validate",
  validate({ applicationContext, registry }): void {
    const state = stateFor(applicationContext);
    validateBunHttpMiddleware(state.http, registry);
    if (!state.sessionManager && registry.methods.some((plan) => (
      plan.middleware.some((attachment) => attachment.target === CsrfMiddleware)
    ))) {
      throw new BunAdapterError("The built-in csrf middleware requires configured Bun HTTP sessions.");
    }
    validateBunSecurityMiddleware(state, registry);
  },
});

function validateBunSecurityMiddleware(state: BunRuntimeState, registry: Parameters<typeof validateBunHttpMiddleware>[1]): void {
  for (const plan of registry.methods) {
    for (const attachment of plan.middleware) {
      if (attachment.target === AuthenticateMiddleware || attachment.target === GuestMiddleware) {
        if (!state.authManager) throw new BunAdapterError(`The built-in ${attachment.target === AuthenticateMiddleware ? "auth" : "guest"} middleware requires configured authentication.`);
        if (attachment.parameters.length > 1) throw new BunAdapterError(`${attachment.target.name} accepts at most one guard name.`);
        if (attachment.parameters[0]) state.authManager.guard(attachment.parameters[0]);
      }
      if (attachment.target === AuthorizeMiddleware) {
        if (!state.authorizationManager) throw new BunAdapterError("The built-in can middleware requires configured authorization.");
        if (attachment.parameters.length < 1 || attachment.parameters.length > 2) {
          throw new BunAdapterError("The built-in can middleware requires an ability and accepts one optional policy name.");
        }
        const [ability, policy] = attachment.parameters;
        if (!state.authorizationManager.hasAbility(ability!, policy)) {
          throw new BunAdapterError(`The can middleware references unknown ${policy ? `policy ability ${JSON.stringify(`${policy}.${ability}`)}` : `ability ${JSON.stringify(ability)}`}.`);
        }
        if (policy && plan.kind === BUN_HTTP_ROUTE_KIND) {
          const owner = registry.classes.find((entry) => entry.target === plan.target);
          const route = owner && bunHttpCompiledRoute({
            ownerKindId: owner.kind.id,
            ownerData: owner.data,
            methodData: plan.data,
            transportParameterCount: plan.parameters.filter((parameter) => parameter.source === "transport").length,
          });
          if (!route?.path.split("/").includes(`:${policy}`)) {
            throw new BunAdapterError(`The can middleware policy ${JSON.stringify(policy)} requires route parameter ":${policy}".`);
          }
        }
      }
    }
  }
}

export class BunAdapter<Principal = unknown> extends Adapter<BunRuntimeContext> {
  static readonly compiler = BUN_COMPILER_DESCRIPTOR;

  readonly #role: BunRuntimeRole;
  readonly #queues: BunQueueOptions | undefined;
  readonly #handleSignals: boolean;
  readonly #http: BunHttpServerOptions<Principal>;
  readonly #scheduler: BunSchedulerOptions | undefined;

  constructor(options: BunAdapterOptions<Principal> = {}) {
    if (typeof options !== "object" || options === null || Array.isArray(options)) {
      throw new BunAdapterError("BunAdapter options must be an object when supplied.");
    }
    const role = options.role ?? "http";
    if (!RUNTIME_ROLES.has(role)) {
      throw new BunAdapterError(
        `BunAdapter role must be one of http, worker, scheduler, or command; received ${JSON.stringify(role)}.`,
      );
    }
    if (options.handleSignals !== undefined && typeof options.handleSignals !== "boolean") {
      throw new BunAdapterError("BunAdapter handleSignals must be a boolean when supplied.");
    }
    if (options.http !== undefined && (typeof options.http !== "object" || options.http === null || Array.isArray(options.http))) {
      throw new BunAdapterError("BunAdapter http options must be an object when supplied.");
    }
    if (role !== "http" && role !== "command" && options.http !== undefined) {
      throw new BunAdapterError("BunAdapter http options can only be used with the http or command runtime role.");
    }
    const http = options.http ?? {};
    if (http.hostname !== undefined && (typeof http.hostname !== "string" || http.hostname.trim().length === 0)) {
      throw new BunAdapterError("BunAdapter HTTP hostname must be a non-empty string when supplied.");
    }
    if (http.port !== undefined && (!Number.isInteger(http.port) || http.port < 0 || http.port > 65_535)) {
      throw new BunAdapterError("BunAdapter HTTP port must be an integer between 0 and 65535.");
    }
    if (http.onServer !== undefined && typeof http.onServer !== "function") {
      throw new BunAdapterError("BunAdapter HTTP onServer callback must be callable when supplied.");
    }
    if (http.mode !== undefined && http.mode !== "production" && http.mode !== "development") {
      throw new BunAdapterError('BunAdapter HTTP mode must be "production" or "development" when supplied.');
    }
    if (http.responseResolvers !== undefined && !Array.isArray(http.responseResolvers)) {
      throw new BunAdapterError("BunAdapter HTTP responseResolvers must be an array when supplied.");
    }
    for (const resolver of http.responseResolvers ?? []) {
      if (typeof resolver !== "object" || resolver === null || typeof resolver.resolve !== "function") {
        throw new BunAdapterError("Every BunAdapter HTTP response resolver must provide a callable resolve method.");
      }
    }
    if (http.exceptionHandler !== undefined && (
      typeof http.exceptionHandler !== "object"
      || http.exceptionHandler === null
      || typeof http.exceptionHandler.report !== "function"
      || typeof http.exceptionHandler.render !== "function"
    )) {
      throw new BunAdapterError("BunAdapter HTTP exceptionHandler must provide callable report and render methods.");
    }
    if (http.sessions !== undefined && (typeof http.sessions !== "object" || http.sessions === null)) {
      throw new BunAdapterError("BunAdapter HTTP sessions options must be an object when supplied.");
    }
    if (http.sessions) {
      try { validateBunSessionOptions(http.sessions); }
      catch (error) { throw new BunAdapterError(error instanceof Error ? error.message : String(error)); }
    }
    if (http.csrf !== undefined && (typeof http.csrf !== "object" || http.csrf === null)) {
      throw new BunAdapterError("BunAdapter HTTP csrf options must be an object when supplied.");
    }
    if (http.csrf !== undefined && http.sessions === undefined) {
      throw new BunAdapterError("BunAdapter HTTP csrf options require configured sessions.");
    }
    if (http.csrf) {
      try { validateBunCsrfOptions(http.csrf); }
      catch (error) { throw new BunAdapterError(error instanceof Error ? error.message : String(error)); }
    }
    if (http.auth !== undefined) {
      try { validateBunAuthenticationOptions(http.auth); }
      catch (error) { throw new BunAdapterError(error instanceof Error ? error.message : String(error)); }
      if (!http.sessions && http.auth.guards.some((guard) => guard.requiresSession)) {
        throw new BunAdapterError("Session-backed authentication guards require configured Bun HTTP sessions.");
      }
      if (http.auth.oauth !== undefined) {
        if (!http.sessions) throw new BunAdapterError("OAuth requires configured Bun HTTP sessions.");
        try { validateBunOAuthOptions(http.auth.oauth); }
        catch (error) { throw new BunAdapterError(error instanceof Error ? error.message : String(error)); }
      }
    }
    if (http.authorization !== undefined) {
      try { validateBunAuthorizationOptions(http.authorization); }
      catch (error) { throw new BunAdapterError(error instanceof Error ? error.message : String(error)); }
    }
    if (http.pages !== undefined) {
      try { new BunPageManager(http.pages); }
      catch (error) { throw new BunAdapterError(error instanceof Error ? error.message : String(error)); }
    }
    validateQueueOptions(options.queues);
    if (role === "worker" || (role === "command" && options.queues?.worker !== undefined)) assertWorkerDriver(options.queues?.driver);
    else if (role !== "command" && options.queues?.worker !== undefined) throw new BunAdapterError("Queue worker options require the worker or command runtime role.");
    if (options.scheduler !== undefined && role !== "scheduler" && role !== "command") throw new BunAdapterError("BunAdapter scheduler options require the scheduler or command runtime role.");
    if (options.scheduler !== undefined) normalizeSchedulerOptions(options.scheduler);
    super({
      eventListenerDelivery: (context, next) => stateFor(context.invocation.applicationContext!).queueManager.deliverListener(context.listener, context.event, next),
      parameterResolvers: [bunHttpContextResolver, bunFormRequestResolver, bunCommandArgumentResolver, bunCommandOptionResolver, bunCommandFlagResolver],
      registryConsumers: [bunRegistryConsumer],
      validationHooks: [bunValidationHook],
    });
    this.#role = role;
    this.#scheduler = options.scheduler === undefined ? undefined : Object.freeze({ ...options.scheduler });
    this.#queues = options.queues === undefined ? undefined : Object.freeze({ ...options.queues,
      ...(options.queues.worker === undefined ? {} : { worker: workerOptions(options.queues.worker) }),
      ...(options.queues.eventCodecs === undefined ? {} : { eventCodecs: snapshotEventCodecs(options.queues.eventCodecs) }) });
    this.#handleSignals = options.handleSignals ?? true;
    this.#http = Object.freeze({
      ...http,
      ...(http.sessions === undefined ? {} : {
        sessions: Object.freeze({
          ...http.sessions,
          ...(http.sessions.cookie === undefined ? {} : { cookie: Object.freeze({ ...http.sessions.cookie }) }),
        }),
      }),
      ...(http.csrf === undefined ? {} : { csrf: Object.freeze({ ...http.csrf }) }),
      ...(http.auth === undefined ? {} : {
        auth: Object.freeze({
          ...http.auth,
          guards: Object.freeze([...http.auth.guards]),
          ...(http.auth.oauth === undefined ? {} : {
            oauth: Object.freeze({
              ...http.auth.oauth,
              providers: Object.freeze([...http.auth.oauth.providers]),
            }),
          }),
        } as BunAuthenticationOptions<Principal>),
      }),
      ...(http.authorization === undefined ? {} : {
        authorization: Object.freeze({
          ...http.authorization,
          abilities: Object.freeze({ ...(http.authorization.abilities ?? {}) }),
          policies: Object.freeze((http.authorization.policies ?? []).map((policy) => Object.freeze({
            ...policy,
            abilities: Object.freeze({ ...policy.abilities }),
          }))),
        } as BunAuthorizationOptions<Principal>),
      }),
      ...(http.pages === undefined ? {} : {
        pages: Object.freeze({
          ...http.pages,
          manifest: Object.freeze({
            ...http.pages.manifest,
            components: Object.freeze([...http.pages.manifest.components]),
            ...(http.pages.manifest.styles ? { styles: Object.freeze([...http.pages.manifest.styles]) } : {}),
            ...(http.pages.manifest.assets ? { assets: Object.freeze([...http.pages.manifest.assets]) } : {}),
          }),
          ...(http.pages.shared === undefined ? {} : {
            shared: Object.freeze(Array.isArray(http.pages.shared) ? [...http.pages.shared] : [http.pages.shared]),
          }),
          ...(http.pages.flash === undefined ? {} : { flash: Object.freeze({ ...http.pages.flash }) }),
        }),
      }),
      mode: http.mode ?? "production",
      responseResolvers: Object.freeze([...(http.responseResolvers ?? [])]),
    });
  }

  protected override async prepareHost(context: AdapterPreparationContext): Promise<BunRuntimeContext> {
    if (context.hasManualContext) {
      throw new BunAdapterError(
        "BunAdapter owns the Bun runtime context and cannot consume Application.withContext().",
      );
    }
    const runtimeContext = Object.freeze({ role: this.#role });
    const scopeManager = new BunExecutionScopeManager(context.rootContainer);
    const queueManager = new QueueManager(context.application, scopeManager, this.#queues);
    scopeManager.applicationScope.value(BUN_QUEUE_MANAGER, queueManager);
    const worker = this.#role === "worker" ? queueManager.createWorker() : undefined;
    if (worker) scopeManager.applicationScope.value(BUN_QUEUE_WORKER, worker);
    const scheduler = this.#role === "scheduler" || this.#role === "command" ? new BunScheduler(context.application, scopeManager, queueManager, this.#scheduler) : undefined;
    if (scheduler) scopeManager.applicationScope.value(BUN_SCHEDULER, scheduler);
    const sessionManager = this.#http.sessions
      ? await SessionManager.create(this.#http.sessions)
      : undefined;
    const csrfManager = sessionManager ? new CsrfManager(sessionManager, this.#http.csrf) : undefined;
    const authManager = this.#http.auth ? new AuthManager(this.#http.auth) : undefined;
    const authorizationManager = this.#http.authorization
      ? new AuthorizationManager(this.#http.authorization)
      : undefined;
    const oauthManager = this.#http.auth?.oauth && authManager
      ? new OAuthManager(this.#http.auth.oauth, authManager)
      : undefined;
    const pageManager = this.#http.pages ? new BunPageManager(this.#http.pages) : undefined;
    if (sessionManager) scopeManager.applicationScope.value(BUN_SESSION_MANAGER, sessionManager);
    if (csrfManager) scopeManager.applicationScope.value(BUN_CSRF_MANAGER, csrfManager);
    if (authManager) scopeManager.applicationScope.value(BUN_AUTH_MANAGER, authManager as AuthManager<unknown>);
    if (authorizationManager) scopeManager.applicationScope.value(BUN_AUTHORIZATION_MANAGER, authorizationManager as AuthorizationManager<unknown>);
    if (oauthManager) scopeManager.applicationScope.value(BUN_OAUTH_MANAGER, oauthManager as OAuthManager<unknown>);
    if (pageManager) scopeManager.applicationScope.value(BUN_PAGE_MANAGER, pageManager as BunPageManager<unknown>);
    const state: BunRuntimeState = {
      worker,
      scheduler,
      commandRuntime: undefined,
      queueManager,
      registryConsumed: false,
      scopeManager,
      http: createBunHttpRuntimeState(),
      requests: createBunFormRequestRuntimeState(),
      signal: undefined,
      signalHandlers: undefined,
      sessionManager,
      csrfManager,
      authManager: authManager as AuthManager | undefined,
      authorizationManager: authorizationManager as AuthorizationManager | undefined,
      oauthManager: oauthManager as OAuthManager | undefined,
      pageManager: pageManager as BunPageManager | undefined,
    };
    if (this.#role === "command" && scheduler) {
      const commandRuntime = new BunCommandRuntime(context.application, scopeManager, queueManager, scheduler, {
        serve: async () => {
          await startBunHttpServer(state.http, state.scopeManager, this.#http as unknown as BunHttpServerOptions, state.sessionManager, state.csrfManager, state.authManager, state.authorizationManager, state.oauthManager, state.pageManager);
          await commandRuntime.stopped;
        },
        work: async () => {
          const activeWorker = state.worker ??= state.queueManager.createWorker();
          scopeManager.applicationScope.value(BUN_QUEUE_WORKER, activeWorker);
          activeWorker.start(); await activeWorker.done;
        },
      });
      state.commandRuntime = commandRuntime;
      scopeManager.applicationScope.value(BUN_COMMAND_RUNTIME, commandRuntime);
    }
    runtimeStates.set(runtimeContext, state);
    return runtimeContext;
  }

  protected override async startHost(context: AdapterHostContext<BunRuntimeContext>): Promise<void> {
    const state = stateFor(context.applicationContext);
    if (!state.registryConsumed) {
      throw new BunAdapterError(
        "BunAdapter cannot start before consuming the generated Bunwire runtime registry.",
      );
    }
    await state.queueManager.initialize();
    if (state.scheduler) await state.scheduler.initialize();
    if (context.applicationContext.role === "http") {
      await startBunHttpServer(
        state.http,
        state.scopeManager,
        this.#http as unknown as BunHttpServerOptions,
        state.sessionManager,
        state.csrfManager,
        state.authManager,
        state.authorizationManager,
        state.oauthManager,
        state.pageManager,
      );
    }
    if (this.#handleSignals) {
      installSignalHandlers(context.application, state);
    }
    state.worker?.start();
    if (context.applicationContext.role === "scheduler") state.scheduler?.start();
  }

  protected override async stopHost(context: AdapterHostContext<BunRuntimeContext>): Promise<void> {
    const state = stateFor(context.applicationContext);
    const errors: unknown[] = [];
    state.commandRuntime?.beginShutdown();
    state.scopeManager.beginShutdown();
    try { if (state.scheduler) await state.scheduler.stop(); } catch (error) { errors.push(error); }
    const draining = state.queueManager.drain();
    try {
      await stopBunHttpServer(state.http);
    } catch (error) {
      errors.push(error);
    }
    try { await draining; } catch (error) { errors.push(error); }
    try { await state.scopeManager.dispose(); } catch (error) { errors.push(error); }
    try { await state.queueManager.close(); } catch (error) { errors.push(error); }
    try { if (state.scheduler) await state.scheduler.close(); } catch (error) { errors.push(error); }
    removeSignalHandlers(state);
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, "Bun HTTP server, scheduler, execution-scope, or queue cleanup failed.");
    }
  }
}
