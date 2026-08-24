import {
  APPLICATION_CONTEXT,
  Adapter,
  Provider,
  createToken,
  defineAdapterValidationHook,
  defineParameterResolver,
  defineRuntimeRegistryConsumer,
  executeMiddlewareChain,
  type AdapterHostContext,
  type AdapterPreparationContext,
  type Container,
  type ControllerClassMetadata,
  type ManagedMethodPlan,
  type MiddlewareConstructor,
  type NativeObjectConfigurationCallback,
  type RuntimeRegistry,
  type RuntimeRegistryConsumerContext,
} from "@bunwire/core";
import {
  ELECTROBUN_COMPILER_DESCRIPTOR,
  ELECTROBUN_CONTEXT_RESOLVER_ID,
  ELECTROBUN_MESSAGE_KIND,
  ELECTROBUN_ROUTE_KIND,
  ELECTROBUN_WEBVIEW_RESOLVER_ID,
  ELECTROBUN_WINDOW_RESOLVER_ID,
  type ElectrobunMethodMetadata,
} from "./definitions.js";
import {
  createElectrobunMiddlewareContext,
  createElectrobunMiddlewareDefinitions,
  selectElectrobunMiddleware,
  type ElectrobunMiddlewareRuntimeDefinition,
  type ElectrobunMiddlewareTransport,
} from "./middleware.js";
import { normalizeElectrobunPath } from "./path.js";

export interface BunwireElectrobunSchema {
  bun: {
    requests: Record<string, { params: unknown; response: unknown }>;
    messages: Record<string, unknown>;
  };
  webview: {
    requests: Record<string, { params: unknown; response: unknown }>;
    messages: Record<string, unknown>;
  };
}

export interface ElectrobunRPC {
  readonly setTransport: (transport: object) => void;
  readonly setRequestHandler: (handler: ElectrobunRequestHandler) => void;
  readonly request: ((method: string, payload?: unknown) => Promise<unknown>)
    & Record<string, (payload?: unknown) => Promise<unknown>>;
  readonly requestProxy: Record<string, (payload?: unknown) => Promise<unknown>>;
  readonly send: ((method: string, payload?: unknown) => void)
    & Record<string, (payload?: unknown) => void>;
  readonly sendProxy: Record<string, (payload?: unknown) => void>;
  readonly addMessageListener: {
    (message: "*", listener: (method: string, payload: unknown) => void): void;
    (message: string, listener: (payload: unknown) => void): void;
  };
  readonly removeMessageListener: {
    (message: "*", listener: (method: string, payload: unknown) => void): void;
    (message: string, listener: (payload: unknown) => void): void;
  };
  readonly proxy: object;
}

export interface ElectrobunWebview {
  readonly id: number;
  readonly windowId: number;
  readonly rpc?: ElectrobunRPC;
  url: string | null;
  html: string | null;
  preload: string | null;
  renderer: "native" | "cef";
  readonly executeJavascript: (script: string) => unknown;
  readonly loadURL: (url: string) => unknown;
  readonly loadHTML: (html: string) => unknown;
  readonly setNavigationRules: (rules: string[]) => unknown;
  readonly findInPage: (
    searchText: string,
    options?: { readonly forward?: boolean; readonly matchCase?: boolean },
  ) => unknown;
  readonly stopFindInPage: () => unknown;
  readonly openDevTools: () => unknown;
  readonly closeDevTools: () => unknown;
  readonly toggleDevTools: () => unknown;
  readonly setPageZoom: (zoomLevel: number) => unknown;
  readonly getPageZoom: () => number;
  readonly on: (
    name:
      | "will-navigate"
      | "did-navigate"
      | "did-navigate-in-page"
      | "did-commit-navigation"
      | "dom-ready"
      | "download-started"
      | "download-progress"
      | "download-completed"
      | "download-failed",
    handler: (event: unknown) => void,
  ) => unknown;
  readonly remove: () => unknown;
}

export interface ElectrobunWindow {
  readonly id: number;
  title: string;
  url: string | null;
  html: string | null;
  preload: string | null;
  renderer: "native" | "cef";
  readonly webview: ElectrobunWebview;
  frame: { x: number; y: number; width: number; height: number };
  readonly show: () => unknown | Promise<unknown>;
  readonly showInactive: () => unknown | Promise<unknown>;
  readonly hide: () => unknown | Promise<unknown>;
  readonly activate: () => unknown | Promise<unknown>;
  readonly close: () => unknown | Promise<unknown>;
  readonly setTitle: (title: string) => unknown | Promise<unknown>;
  readonly focus: () => unknown | Promise<unknown>;
  readonly minimize: () => unknown | Promise<unknown>;
  readonly unminimize: () => unknown | Promise<unknown>;
  readonly isMinimized: () => boolean;
  readonly maximize: () => unknown | Promise<unknown>;
  readonly unmaximize: () => unknown | Promise<unknown>;
  readonly isMaximized: () => boolean;
  readonly setFullScreen: (fullScreen: boolean) => unknown | Promise<unknown>;
  readonly isFullScreen: () => boolean;
  readonly setAlwaysOnTop: (alwaysOnTop: boolean) => unknown | Promise<unknown>;
  readonly isAlwaysOnTop: () => boolean;
  readonly setVisibleOnAllWorkspaces: (visible: boolean) => unknown | Promise<unknown>;
  readonly isVisibleOnAllWorkspaces: () => boolean;
  readonly setPosition: (x: number, y: number) => unknown | Promise<unknown>;
  readonly setWindowButtonPosition: (x: number, y: number) => unknown | Promise<unknown>;
  readonly setSize: (width: number, height: number) => unknown | Promise<unknown>;
  readonly setFrame: (x: number, y: number, width: number, height: number) => unknown | Promise<unknown>;
  readonly getFrame: () => { x: number; y: number; width: number; height: number };
  readonly getPosition: () => { x: number; y: number };
  readonly getSize: () => { width: number; height: number };
  readonly setPageZoom: (zoomLevel: number) => unknown;
  readonly getPageZoom: () => number;
  readonly on: (name: string, handler: (event: unknown) => void) => unknown;
}

interface NativeWindowOptions {
  readonly trafficLightOffset?: { readonly x: number; readonly y: number };
  readonly activate?: boolean;
  readonly title?: string;
  readonly frame?: { readonly x?: number; readonly y?: number; readonly width?: number; readonly height?: number };
  readonly url?: string | null;
  readonly html?: string | null;
  readonly preload?: string | null;
  readonly viewsRoot?: string | null;
  readonly renderer?: "native" | "cef";
  readonly rpc?: ElectrobunRPC;
  readonly styleMask?: object;
  readonly titleBarStyle?: "hidden" | "hiddenInset" | "default";
  readonly transparent?: boolean;
  readonly passthrough?: boolean;
  readonly hidden?: boolean;
  readonly navigationRules?: string | null;
  readonly sandbox?: boolean;
}

interface NativeModule {
  readonly BrowserView: {
    defineRPC<Schema extends BunwireElectrobunSchema>(config: {
      readonly maxRequestTime?: number;
      readonly handlers: {
        readonly requests: object | ElectrobunRequestHandler;
        readonly messages: object;
      };
    }): ElectrobunRPC;
  };
  readonly BrowserWindow: new (options?: NativeWindowOptions) => ElectrobunWindow;
}

export interface ElectrobunContext {
  readonly window: ElectrobunWindow;
  readonly webview: ElectrobunWebview;
  readonly rpc: ElectrobunRPC;
}

export const ELECTROBUN_CONTEXT = createToken<ElectrobunContext>("electrobun.context");
export const ELECTROBUN_WINDOW = createToken<ElectrobunWindow>("electrobun.window");
export const ELECTROBUN_WEBVIEW = createToken<ElectrobunWebview>("electrobun.webview");
export const ELECTROBUN_RPC = createToken<ElectrobunRPC>("electrobun.rpc");

export class ElectrobunAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ElectrobunAdapterError";
  }
}

export class ElectrobunTrafficNotReadyError extends ElectrobunAdapterError {
  readonly endpoint: string;

  constructor(endpoint: string) {
    super(`Electrobun managed endpoint "${endpoint}" cannot accept traffic before Bunwire Providers and registries are ready.`);
    this.name = "ElectrobunTrafficNotReadyError";
    this.endpoint = endpoint;
  }
}

export interface ElectrobunMessageErrorContext {
  readonly endpoint: string;
  readonly payload: unknown;
}

export interface ElectrobunRpcOptions {
  readonly maxRequestTime?: number;
  readonly configure?: NativeObjectConfigurationCallback<ElectrobunRPC>;
  readonly onMessageError?: (error: unknown, context: ElectrobunMessageErrorContext) => void | Promise<void>;
}

type NativeMainWindowOptions = Omit<NativeWindowOptions, "frame" | "rpc">;

export interface ElectrobunMainWindowOptions extends NativeMainWindowOptions {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly configure?: NativeObjectConfigurationCallback<ElectrobunWindow>;
}

export interface ElectrobunAdapterOptions {
  readonly mainWindow?: ElectrobunMainWindowOptions;
  readonly rpc?: ElectrobunRpcOptions;
}

interface ElectrobunInvocationPayload {
  readonly args: readonly unknown[];
}

export interface ElectrobunClientTransport {
  readonly request: (...args: any[]) => Promise<any>;
  readonly send: (...args: any[]) => void;
}

export interface ElectrobunPositionalClient {
  readonly request: (method: string, ...args: readonly unknown[]) => Promise<unknown>;
  readonly message: (method: string, ...args: readonly unknown[]) => void;
}

type CallerMethodContract<Contract> = {
  [Method in keyof Contract]: (...args: any[]) => any;
};

export type ElectrobunClientSchema<
  Requests extends CallerMethodContract<Requests>,
  Messages extends CallerMethodContract<Messages>,
> = {
  bun: {
    requests: {
      [Method in keyof Requests]: {
        params: ElectrobunInvocationPayload;
        response: Awaited<ReturnType<Requests[Method]>>;
      };
    };
    messages: { [Method in keyof Messages]: ElectrobunInvocationPayload };
  };
  webview: {
    requests: Record<never, never>;
    messages: Record<never, never>;
  };
};

function invocationPayload(args: readonly unknown[]): ElectrobunInvocationPayload {
  return Object.freeze({ args: Object.freeze([...args]) });
}

export function createElectrobunClient(
  transport: ElectrobunClientTransport,
): ElectrobunPositionalClient {
  if (!transport || typeof transport.request !== "function" || typeof transport.send !== "function") {
    throw new ElectrobunAdapterError(
      "createElectrobunClient() requires an Electrobun frontend RPC object with request() and send().",
    );
  }
  return Object.freeze({
    request: (method: string, ...args: readonly unknown[]) => (
      transport.request(method, invocationPayload(args))
    ),
    message: (method: string, ...args: readonly unknown[]) => {
      transport.send(method, invocationPayload(args));
    },
  });
}

export type ElectrobunRequestHandler = (
  method: string,
  payload: unknown,
) => unknown | Promise<unknown>;

export interface ManualElectrobunAdapterOptions {
  readonly fallbackRequestHandler?: ElectrobunRequestHandler;
}

interface RuntimeState {
  readonly requestPlans: Map<string, ManagedMethodPlan>;
  readonly messagePlans: Map<string, ManagedMethodPlan>;
  readonly onMessageError: ElectrobunRpcOptions["onMessageError"];
  readonly fallbackRequestHandler: ElectrobunRequestHandler | undefined;
  middlewareDefinitions: ReadonlyMap<MiddlewareConstructor, ElectrobunMiddlewareRuntimeDefinition>;
  ready: boolean;
  showOnStart: boolean;
  activateOnStart: boolean;
}

const runtimeStates = new WeakMap<object, RuntimeState>();
const attachedRpcs = new WeakSet<object>();

function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

export function assertElectrobunContext(value: unknown): asserts value is ElectrobunContext {
  if (!isObject(value) || !isObject(value.window) || !isObject(value.webview) || !isObject(value.rpc)) {
    throw new ElectrobunAdapterError("Electrobun context must contain native window, webview, and rpc objects.");
  }
  if (value.window.webview !== value.webview) {
    throw new ElectrobunAdapterError("Electrobun context webview must be the exact native BrowserView owned by context.window.");
  }
  if (value.webview.rpc !== value.rpc) {
    throw new ElectrobunAdapterError("Electrobun context rpc must be the exact native RPC object attached to context.webview.");
  }
  for (const method of ["setRequestHandler", "addMessageListener", "send", "request"] as const) {
    if (typeof value.rpc[method] !== "function") {
      throw new ElectrobunAdapterError(`Electrobun context rpc is missing native ${method}().`);
    }
  }
}

export function defineElectrobunContext(window: object): ElectrobunContext {
  if (!isObject(window)) {
    throw new ElectrobunAdapterError("defineElectrobunContext() requires an Electrobun BrowserWindow object.");
  }
  const webview = isObject(window.webview) ? window.webview : undefined;
  const rpc = webview && isObject(webview.rpc) ? webview.rpc : undefined;
  const context = { window, webview, rpc };
  assertElectrobunContext(context);
  return Object.freeze(context);
}

function createState(
  context: ElectrobunContext,
  options: {
    readonly onMessageError?: ElectrobunRpcOptions["onMessageError"];
    readonly showOnStart: boolean;
    readonly activateOnStart: boolean;
    readonly fallbackRequestHandler?: ElectrobunRequestHandler;
  },
): RuntimeState {
  if (runtimeStates.has(context) || attachedRpcs.has(context.rpc)) {
    throw new ElectrobunAdapterError("An Electrobun context cannot be attached to more than one adapter lifecycle.");
  }
  const state: RuntimeState = {
    requestPlans: new Map(),
    messagePlans: new Map(),
    onMessageError: options.onMessageError,
    fallbackRequestHandler: options.fallbackRequestHandler,
    middlewareDefinitions: new Map(),
    ready: false,
    showOnStart: options.showOnStart,
    activateOnStart: options.activateOnStart,
  };
  runtimeStates.set(context, state);
  attachedRpcs.add(context.rpc);
  return state;
}

function stateFor(context: ElectrobunContext): RuntimeState {
  const state = runtimeStates.get(context);
  if (!state) throw new ElectrobunAdapterError("Electrobun adapter context has not been prepared.");
  return state;
}

function callerArguments(payload: unknown): readonly unknown[] {
  if (!isElectrobunInvocationPayload(payload)) {
    throw new ElectrobunAdapterError(
      'The Electrobun Bunwire wire payload must contain an `args` array.',
    );
  }
  return [...payload.args];
}

function isElectrobunInvocationPayload(
  payload: unknown,
): payload is ElectrobunInvocationPayload {
  return isObject(payload) && Array.isArray(payload.args);
}

function controllerPrefix(registry: RuntimeRegistry, plan: ManagedMethodPlan): string | undefined {
  const owner = registry.classes.find((entry) => entry.target === plan.target);
  if (!owner) {
    throw new ElectrobunAdapterError(
      `Electrobun managed method "${plan.target.name}.${String(plan.method)}" has no generated owning class entry.`,
    );
  }
  const data = owner.data as Partial<ControllerClassMetadata> | undefined;
  if (data === undefined || (data.prefix !== undefined && typeof data.prefix !== "string")) {
    throw new ElectrobunAdapterError(`Electrobun Controller "${plan.target.name}" has malformed prefix metadata.`);
  }
  return data.prefix;
}

function endpointFor(registry: RuntimeRegistry, plan: ManagedMethodPlan): string {
  const data = plan.data as Partial<ElectrobunMethodMetadata> | undefined;
  if (!data || (data.path !== undefined && typeof data.path !== "string")) {
    throw new ElectrobunAdapterError(
      `Electrobun managed method "${plan.target.name}.${String(plan.method)}" has malformed path metadata.`,
    );
  }
  return normalizeElectrobunPath(controllerPrefix(registry, plan), data.path, plan.method);
}

function relevantPlans(registry: RuntimeRegistry): readonly ManagedMethodPlan[] {
  return registry.methods.filter(
    (plan) => plan.kind === ELECTROBUN_ROUTE_KIND || plan.kind === ELECTROBUN_MESSAGE_KIND,
  );
}

function validateEndpoints(registry: RuntimeRegistry): void {
  const requests = new Map<string, ManagedMethodPlan>();
  const messages = new Map<string, ManagedMethodPlan>();
  for (const plan of relevantPlans(registry)) {
    const endpoint = endpointFor(registry, plan);
    const endpoints = plan.kind === ELECTROBUN_ROUTE_KIND ? requests : messages;
    const existing = endpoints.get(endpoint);
    if (existing) {
      throw new ElectrobunAdapterError(
        `Duplicate Electrobun ${plan.kind === ELECTROBUN_ROUTE_KIND ? "request" : "message"} endpoint "${endpoint}" is declared by "${existing.target.name}.${String(existing.method)}" and "${plan.target.name}.${String(plan.method)}".`,
      );
    }
    endpoints.set(endpoint, plan);
  }
}

export class ElectrobunBindingsProvider {
  register(container: Container): void {
    const context = container.get(APPLICATION_CONTEXT);
    assertElectrobunContext(context);
    container.value(ELECTROBUN_CONTEXT, context);
    container.value(ELECTROBUN_WINDOW, context.window);
    container.value(ELECTROBUN_WEBVIEW, context.webview);
    container.value(ELECTROBUN_RPC, context.rpc);
  }
}
Provider()(ElectrobunBindingsProvider);

const windowResolver = defineParameterResolver({
  id: ELECTROBUN_WINDOW_RESOLVER_ID,
  resolve: ({ context }) => {
    assertElectrobunContext(context.applicationContext);
    return context.applicationContext.window;
  },
});

const webviewResolver = defineParameterResolver({
  id: ELECTROBUN_WEBVIEW_RESOLVER_ID,
  resolve: ({ context }) => {
    assertElectrobunContext(context.applicationContext);
    return context.applicationContext.webview;
  },
});

const contextResolver = defineParameterResolver({
  id: ELECTROBUN_CONTEXT_RESOLVER_ID,
  resolve: ({ context }) => {
    assertElectrobunContext(context.applicationContext);
    return context.applicationContext;
  },
});

const validationHook = defineAdapterValidationHook({
  id: "electrobun.validate",
  validate: ({ applicationContext, registry }: AdapterHostContext<ElectrobunContext>) => {
    assertElectrobunContext(applicationContext);
    const state = stateFor(applicationContext);
    const plans = relevantPlans(registry);
    validateEndpoints(registry);
    state.middlewareDefinitions = createElectrobunMiddlewareDefinitions(registry, plans);
  },
});

function invokeElectrobunPlan<Result>(
  context: RuntimeRegistryConsumerContext<ElectrobunContext>,
  state: RuntimeState,
  plan: ManagedMethodPlan,
  endpoint: string,
  transport: ElectrobunMiddlewareTransport,
  args: readonly unknown[],
): Promise<Result> {
  const attachments = selectElectrobunMiddleware(
    plan,
    state.middlewareDefinitions,
    endpoint,
    transport,
  );
  return context.invoke<Result>(plan, args, {
    around: (invocation, next) => executeMiddlewareChain({
      invocation,
      attachments,
      createContext: (attachment) => createElectrobunMiddlewareContext(
        context.applicationContext,
        endpoint,
        transport,
        args,
        attachment,
      ),
      terminal: next,
    }),
  });
}

const registryConsumer = defineRuntimeRegistryConsumer<"electrobun.registry", ElectrobunContext>({
  id: "electrobun.registry",
  consume: (registry, context) => {
    assertElectrobunContext(context.applicationContext);
    const state = stateFor(context.applicationContext);
    for (const plan of relevantPlans(registry)) {
      const endpoint = endpointFor(registry, plan);
      (plan.kind === ELECTROBUN_ROUTE_KIND ? state.requestPlans : state.messagePlans).set(endpoint, plan);
    }

    context.applicationContext.rpc.setRequestHandler((method: string, payload: unknown) => {
      const endpoint = String(method);
      const plan = state.requestPlans.get(endpoint);
      if (plan) {
        if (!state.ready) throw new ElectrobunTrafficNotReadyError(endpoint);
        return invokeElectrobunPlan(context, state, plan, endpoint, "request", callerArguments(payload));
      }
      if (state.fallbackRequestHandler) return state.fallbackRequestHandler(endpoint, payload);
      if (!state.ready) throw new ElectrobunTrafficNotReadyError(endpoint);
      throw new ElectrobunAdapterError(`No Bunwire Electrobun request endpoint is registered for "${endpoint}".`);
    });

    context.applicationContext.rpc.addMessageListener("*", (method: string, payload: unknown) => {
      const endpoint = String(method);
      if (!state.ready) throw new ElectrobunTrafficNotReadyError(endpoint);
      const plan = state.messagePlans.get(endpoint);
      if (!plan) return;
      void invokeElectrobunPlan(context, state, plan, endpoint, "message", callerArguments(payload)).catch((error) => {
        if (state.onMessageError) {
          void (async () => {
            try {
              await state.onMessageError?.(error, { endpoint, payload });
            } catch (callbackError) {
              console.error(
              `Bunwire Electrobun onMessageError callback failed for "${endpoint}".`,
              callbackError,
              );
            }
          })();
        } else {
          console.error(`Bunwire Electrobun message endpoint "${endpoint}" failed.`, error);
        }
      });
    });
  },
});

const adapterRuntime = {
  providers: [ElectrobunBindingsProvider],
  parameterResolvers: [windowResolver, webviewResolver, contextResolver],
  registryConsumers: [registryConsumer],
  validationHooks: [validationHook],
} as const;

abstract class ElectrobunAdapterBase extends Adapter<ElectrobunContext> {
  protected constructor() {
    super(adapterRuntime);
  }

  protected override async startHost(context: AdapterHostContext<ElectrobunContext>): Promise<void> {
    const state = stateFor(context.applicationContext);
    if (state.showOnStart) {
      if (state.activateOnStart) await context.applicationContext.window.show();
      else await context.applicationContext.window.showInactive();
    }
    state.ready = true;
  }
}

export class ElectrobunAdapter extends ElectrobunAdapterBase {
  static readonly compiler = ELECTROBUN_COMPILER_DESCRIPTOR;
  readonly #options: ElectrobunAdapterOptions;

  constructor(options: ElectrobunAdapterOptions = {}) {
    super();
    this.#options = options;
  }

  protected override async prepareHost(context: AdapterPreparationContext): Promise<ElectrobunContext> {
    if (context.hasManualContext) {
      throw new ElectrobunAdapterError(
        "ElectrobunAdapter owns the normal native host and cannot consume withContext(); use ManualElectrobunAdapter for an existing host.",
      );
    }
    const nativeModuleSpecifier = "electrobun/bun";
    const native = await import(nativeModuleSpecifier) as unknown as NativeModule;
    let state: RuntimeState | undefined;
    const rpc = native.BrowserView.defineRPC<BunwireElectrobunSchema>({
      ...(this.#options.rpc?.maxRequestTime === undefined
        ? {}
        : { maxRequestTime: this.#options.rpc.maxRequestTime }),
      handlers: {
        requests: (method: string) => {
          throw new ElectrobunTrafficNotReadyError(String(method));
        },
        messages: {
          "*": (method: string) => {
            if (!state?.ready) throw new ElectrobunTrafficNotReadyError(String(method));
          },
        },
      },
    });

    const configured = this.#options.mainWindow ?? {};
    const {
      x = 0,
      y = 0,
      width = 800,
      height = 600,
      configure,
      hidden = false,
      activate = true,
      ...nativeOptions
    } = configured;
    const window = new native.BrowserWindow({
      ...nativeOptions,
      ...(nativeOptions.url === undefined && nativeOptions.html === undefined
        ? { url: "views://mainview/index.html" }
        : {}),
      title: configured.title ?? "Bunwire",
      frame: { x, y, width, height },
      rpc,
      hidden: true,
      activate: false,
    });
    const prepared = defineElectrobunContext(window);
    state = createState(prepared, {
      ...(this.#options.rpc?.onMessageError === undefined
        ? {}
        : { onMessageError: this.#options.rpc.onMessageError }),
      showOnStart: !hidden,
      activateOnStart: activate,
    });
    // BrowserWindow constructs its BrowserView and installs the native RPC
    // transport, so the escape hatch receives a fully attached RPC object.
    await this.#options.rpc?.configure?.(rpc);
    await configure?.(window);
    return prepared;
  }
}

export class ManualElectrobunAdapter extends ElectrobunAdapterBase {
  static readonly compiler = ELECTROBUN_COMPILER_DESCRIPTOR;
  readonly #options: ManualElectrobunAdapterOptions;

  constructor(options: ManualElectrobunAdapterOptions = {}) {
    super();
    this.#options = options;
  }

  protected override prepareHost(context: AdapterPreparationContext): ElectrobunContext {
    if (!context.hasManualContext) {
      throw new ElectrobunAdapterError(
        "ManualElectrobunAdapter requires an existing ElectrobunContext supplied with Application.withContext().",
      );
    }
    assertElectrobunContext(context.manualContext);
    const state = createState(context.manualContext, {
      showOnStart: false,
      activateOnStart: false,
      ...(this.#options.fallbackRequestHandler === undefined
        ? {}
        : { fallbackRequestHandler: this.#options.fallbackRequestHandler }),
    });
    context.manualContext.rpc.setRequestHandler((method: string) => {
      throw new ElectrobunTrafficNotReadyError(String(method));
    });
    context.manualContext.rpc.addMessageListener("*", (method: string) => {
      if (!state.ready) throw new ElectrobunTrafficNotReadyError(String(method));
    });
    return context.manualContext;
  }
}
