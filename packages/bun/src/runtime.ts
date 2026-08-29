import {
  Adapter,
  defineRuntimeRegistryConsumer,
  type AdapterHostContext,
  type AdapterPreparationContext,
  type Application,
} from "@bunwire/core";
import { BUN_COMPILER_DESCRIPTOR } from "./definitions.js";

export type BunRuntimeRole = "http" | "worker" | "scheduler" | "command";

export interface BunAdapterOptions {
  readonly role?: BunRuntimeRole;
  readonly handleSignals?: boolean;
}

export interface BunRuntimeContext {
  readonly role: BunRuntimeRole;
}

interface BunRuntimeState {
  registryConsumed: boolean;
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
  consume(_registry, context): void {
    stateFor(context.applicationContext).registryConsumed = true;
  },
});

export class BunAdapter extends Adapter<BunRuntimeContext> {
  static readonly compiler = BUN_COMPILER_DESCRIPTOR;

  readonly #role: BunRuntimeRole;
  readonly #handleSignals: boolean;

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
    super({ registryConsumers: [bunRegistryConsumer] });
    this.#role = role;
    this.#handleSignals = options.handleSignals ?? true;
  }

  protected override prepareHost(context: AdapterPreparationContext): BunRuntimeContext {
    if (context.hasManualContext) {
      throw new BunAdapterError(
        "BunAdapter owns the Bun runtime context and cannot consume Application.withContext().",
      );
    }
    const runtimeContext = Object.freeze({ role: this.#role });
    runtimeStates.set(runtimeContext, {
      registryConsumed: false,
      signal: undefined,
      signalHandlers: undefined,
    });
    return runtimeContext;
  }

  protected override startHost(context: AdapterHostContext<BunRuntimeContext>): void {
    const state = stateFor(context.applicationContext);
    if (!state.registryConsumed) {
      throw new BunAdapterError(
        "BunAdapter cannot start before consuming the generated Bunwire runtime registry.",
      );
    }
    if (this.#handleSignals) {
      installSignalHandlers(context.application, state);
    }
  }

  protected override stopHost(context: AdapterHostContext<BunRuntimeContext>): void {
    removeSignalHandlers(stateFor(context.applicationContext));
  }
}
