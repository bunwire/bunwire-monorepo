import {
  Adapter,
  defineAdapterValidationHook,
  defineRuntimeRegistryConsumer,
  type AdapterHostContext,
  type AdapterPreparationContext,
  type Application,
} from "@bunwire/core";
import { BUN_COMPILER_DESCRIPTOR } from "./definitions.js";
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

export type BunRuntimeRole = "http" | "worker" | "scheduler" | "command";

export interface BunAdapterOptions {
  readonly role?: BunRuntimeRole;
  readonly handleSignals?: boolean;
  readonly http?: BunHttpServerOptions;
}

export interface BunRuntimeContext {
  readonly role: BunRuntimeRole;
}

interface BunRuntimeState {
  registryConsumed: boolean;
  scopeManager: BunExecutionScopeManager;
  http: BunHttpRuntimeState;
  signal: BunShutdownSignal | undefined;
  signalHandlers: ReadonlyMap<BunShutdownSignal, () => void> | undefined;
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
    state.registryConsumed = true;
  },
});

const bunValidationHook = defineAdapterValidationHook<"bun.validate", BunRuntimeContext>({
  id: "bun.validate",
  validate({ applicationContext, registry }): void {
    const state = stateFor(applicationContext);
    validateBunHttpMiddleware(state.http, registry);
  },
});

export class BunAdapter extends Adapter<BunRuntimeContext> {
  static readonly compiler = BUN_COMPILER_DESCRIPTOR;

  readonly #role: BunRuntimeRole;
  readonly #handleSignals: boolean;
  readonly #http: BunHttpServerOptions;

  constructor(options: BunAdapterOptions = {}) {
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
    if (role !== "http" && options.http !== undefined) {
      throw new BunAdapterError("BunAdapter http options can only be used with the http runtime role.");
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
    super({
      parameterResolvers: [bunHttpContextResolver],
      registryConsumers: [bunRegistryConsumer],
      validationHooks: [bunValidationHook],
    });
    this.#role = role;
    this.#handleSignals = options.handleSignals ?? true;
    this.#http = Object.freeze({ ...http });
  }

  protected override prepareHost(context: AdapterPreparationContext): BunRuntimeContext {
    if (context.hasManualContext) {
      throw new BunAdapterError(
        "BunAdapter owns the Bun runtime context and cannot consume Application.withContext().",
      );
    }
    const runtimeContext = Object.freeze({ role: this.#role });
    const scopeManager = new BunExecutionScopeManager(context.rootContainer);
    runtimeStates.set(runtimeContext, {
      registryConsumed: false,
      scopeManager,
      http: createBunHttpRuntimeState(),
      signal: undefined,
      signalHandlers: undefined,
    });
    return runtimeContext;
  }

  protected override async startHost(context: AdapterHostContext<BunRuntimeContext>): Promise<void> {
    const state = stateFor(context.applicationContext);
    if (!state.registryConsumed) {
      throw new BunAdapterError(
        "BunAdapter cannot start before consuming the generated Bunwire runtime registry.",
      );
    }
    if (context.applicationContext.role === "http") {
      await startBunHttpServer(state.http, state.scopeManager, this.#http);
    }
    if (this.#handleSignals) {
      installSignalHandlers(context.application, state);
    }
  }

  protected override async stopHost(context: AdapterHostContext<BunRuntimeContext>): Promise<void> {
    const state = stateFor(context.applicationContext);
    const errors: unknown[] = [];
    try {
      await stopBunHttpServer(state.http);
    } catch (error) {
      errors.push(error);
    }
    try {
      await state.scopeManager.dispose();
    } catch (error) {
      errors.push(error);
    } finally {
      removeSignalHandlers(state);
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, "Bun HTTP server and execution-scope cleanup both failed.");
    }
  }
}
