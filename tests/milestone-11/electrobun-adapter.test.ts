import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  APPLICATION_CONTEXT,
  CONTROLLER_KIND,
  Controller,
  Inject,
  Provider,
  SERVICE_KIND,
  Service,
  createToken,
  defineApp,
  defineManagedMethodPlan,
  defineRuntimeRegistry,
  getManagedMethodMetadata,
  getParameterInjectorMetadata,
  type Container,
} from "@bunwire/core";
import {
  Context,
  ELECTROBUN_CONTEXT,
  ELECTROBUN_CONTEXT_RESOLVER_ID,
  ELECTROBUN_MESSAGE_KIND,
  ELECTROBUN_ROUTE_KIND,
  ELECTROBUN_WEBVIEW_RESOLVER_ID,
  ELECTROBUN_WINDOW,
  ELECTROBUN_WINDOW_RESOLVER_ID,
  ElectrobunAdapter,
  ElectrobunAdapterError,
  ElectrobunTrafficNotReadyError,
  ManualElectrobunAdapter,
  Message,
  Route,
  Webview,
  Window,
  defineElectrobunContext,
  normalizeElectrobunPath,
  type ElectrobunContext,
  type ElectrobunRPC,
  type ElectrobunWebview,
  type ElectrobunWindow,
} from "@bunwire/electrobun";
import {
  analyzeBunwireApplication,
  discoverBunwireApplication,
  generateRuntimeRegistryModule,
} from "@bunwire/vite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  BrowserView,
  BrowserWindow,
  FakeElectrobunRPC,
} from "../fixtures/milestone-11-electrobun/fake-native.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/milestone-11-electrobun");

const TEST_CACHE = createToken<{ read(id: string): string }>("test.electrobun-cache");

@Service()
class RuntimeUserService {
  describe(id: string): string { return `service:${id}`; }
}

@Controller(" /users// ")
class RuntimeController {
  messages: string[] = [];

  @Route(" /get/ ")
  get(
    id: string,
    users: RuntimeUserService,
    @Inject(TEST_CACHE) cache: { read(id: string): string },
    @Window() window: ElectrobunWindow,
    @Webview() webview: ElectrobunWebview,
    @Context() context: ElectrobunContext,
  ): string {
    return [users.describe(id), cache.read(id), window.title, webview.id, context.window === window].join("|");
  }

  @Message("selected/")
  selected(id: string, @Window() window: ElectrobunWindow): string {
    this.messages.push(`${id}:${window.title}`);
    return "not-visible-to-caller";
  }

  @Route("get/")
  duplicateGet(): string { return "duplicate"; }

  ordinary(): string { return "private"; }

  @Route("zero")
  zero(): string { return "zero"; }

  @Route("many")
  many(required: string, optional?: string): string { return `${required}:${optional ?? "omitted"}`; }

  @Route("rest")
  rest(prefix: string, ...values: string[]): string { return `${prefix}:${values.join(",")}`; }

  @Route("array")
  array(values: string[]): string { return values.join("|"); }
}

@Controller
class BareDecoratorController {
  @Route
  status(@Window window: ElectrobunWindow): boolean {
    return window.isMaximized();
  }
}

const routePlan = defineManagedMethodPlan({
  kind: ELECTROBUN_ROUTE_KIND,
  ownerKind: CONTROLLER_KIND,
  target: RuntimeController,
  method: "get",
  data: { path: " /get/ " },
  parameters: [
    { source: "transport", methodIndex: 0, argumentIndex: 0, optional: false },
    { source: "container", methodIndex: 1, token: RuntimeUserService },
    { source: "container", methodIndex: 2, token: TEST_CACHE },
    { source: "resolver", methodIndex: 3, resolverId: ELECTROBUN_WINDOW_RESOLVER_ID },
    { source: "resolver", methodIndex: 4, resolverId: ELECTROBUN_WEBVIEW_RESOLVER_ID },
    { source: "resolver", methodIndex: 5, resolverId: ELECTROBUN_CONTEXT_RESOLVER_ID },
  ],
});

const messagePlan = defineManagedMethodPlan({
  kind: ELECTROBUN_MESSAGE_KIND,
  ownerKind: CONTROLLER_KIND,
  target: RuntimeController,
  method: "selected",
  data: { path: "selected/" },
  parameters: [
    { source: "transport", methodIndex: 0, argumentIndex: 0, optional: false },
    { source: "resolver", methodIndex: 1, resolverId: ELECTROBUN_WINDOW_RESOLVER_ID },
  ],
});

const argumentPlans = [
  defineManagedMethodPlan({
    kind: ELECTROBUN_ROUTE_KIND,
    ownerKind: CONTROLLER_KIND,
    target: RuntimeController,
    method: "zero",
    data: { path: "zero" },
    parameters: [],
  }),
  defineManagedMethodPlan({
    kind: ELECTROBUN_ROUTE_KIND,
    ownerKind: CONTROLLER_KIND,
    target: RuntimeController,
    method: "many",
    data: { path: "many" },
    parameters: [
      { source: "transport", methodIndex: 0, argumentIndex: 0, optional: false },
      { source: "transport", methodIndex: 1, argumentIndex: 1, optional: true },
    ],
  }),
  defineManagedMethodPlan({
    kind: ELECTROBUN_ROUTE_KIND,
    ownerKind: CONTROLLER_KIND,
    target: RuntimeController,
    method: "rest",
    data: { path: "rest" },
    parameters: [
      { source: "transport", methodIndex: 0, argumentIndex: 0, optional: false },
      { source: "transport", methodIndex: 1, argumentIndex: 1, optional: false, rest: true },
    ],
  }),
  defineManagedMethodPlan({
    kind: ELECTROBUN_ROUTE_KIND,
    ownerKind: CONTROLLER_KIND,
    target: RuntimeController,
    method: "array",
    data: { path: "array" },
    parameters: [
      { source: "transport", methodIndex: 0, argumentIndex: 0, optional: false },
    ],
  }),
];

function runtimeRegistry(methods = [routePlan, messagePlan, ...argumentPlans]) {
  return defineRuntimeRegistry({
    classes: [
      { kind: SERVICE_KIND, target: RuntimeUserService, data: { scope: "singleton" } },
      { kind: CONTROLLER_KIND, target: RuntimeController, data: { prefix: " /users// " } },
    ],
    methods,
  });
}

function fakeRpc(rpc: ElectrobunRPC): FakeElectrobunRPC {
  return rpc as unknown as FakeElectrobunRPC;
}

function createManualNativeContext(
  requestHandler: ((method: string, payload: unknown) => unknown | Promise<unknown>) | undefined = undefined,
): ElectrobunContext {
  const rpc = BrowserView.defineRPC({
    handlers: { requests: requestHandler ?? {}, messages: {} },
  });
  const window = new BrowserWindow({ title: "Existing", rpc });
  return defineElectrobunContext(window as unknown as ElectrobunWindow);
}

const providerObservations: Array<Record<string, unknown>> = [];

@Provider()
class RuntimeProvider {
  register(container: Container): void {
    const context = container.get(APPLICATION_CONTEXT) as ElectrobunContext;
    let earlyTrafficError: unknown;
    let earlyMessageError: unknown;
    try {
      fakeRpc(context.rpc).receiveRequest("users/get", ["too-early"]);
    } catch (error) {
      earlyTrafficError = error;
    }
    try {
      fakeRpc(context.rpc).receiveMessage("users/selected", "too-early");
    } catch (error) {
      earlyMessageError = error;
    }
    providerObservations.push({
      context,
      contextBinding: container.get(ELECTROBUN_CONTEXT),
      windowBinding: container.get(ELECTROBUN_WINDOW),
      earlyTrafficError,
      earlyMessageError,
    });
    container.value(TEST_CACHE, { read: (id: string) => `cache:${id}` });
  }
}

function configuredApp(adapter: ElectrobunAdapter | ManualElectrobunAdapter) {
  return defineApp()
    .withAdapter(adapter)
    .withProviders(RuntimeProvider)
    .withRuntimeRegistry(runtimeRegistry());
}

beforeEach(() => {
  providerObservations.length = 0;
  BrowserWindow.instances.length = 0;
});

describe.sequential("Milestone 11 — Electrobun compiler integration", () => {
  it("applies optional Electrobun method and parameter decorators in bare form at runtime", () => {
    expect(getManagedMethodMetadata(BareDecoratorController.prototype, "status")).toMatchObject({
      decoratorId: "electrobun.route.decorator",
      data: { path: undefined },
    });
    expect(getParameterInjectorMetadata(BareDecoratorController.prototype, "status", 0)).toMatchObject({
      injectorId: "electrobun.window.decorator",
      resolverId: "electrobun.window",
    });
  });

  it("discovers ElectrobunAdapter from the bootstrap and its generic compiler descriptor", async () => {
    const result = await discoverBunwireApplication({ root: fixtureRoot });
    expect(result.adapter).toMatchObject({
      moduleSpecifier: "@bunwire/electrobun",
      exportName: "ElectrobunAdapter",
      compilerDescriptor: { id: "electrobun.adapter" },
    });
    expect(result.extensions.methodKinds.map(({ id }) => id)).toEqual([
      "electrobun.message",
      "electrobun.route",
    ]);
    expect(result.extensions.parameterInjectors.map(({ id }) => id)).toEqual([
      "electrobun.context.decorator",
      "electrobun.webview.decorator",
      "electrobun.window.decorator",
    ]);
  });

  it("compiles Route, Message, automatic DI, explicit token injection, and Window without Arg", async () => {
    const result = await analyzeBunwireApplication({
      root: fixtureRoot,
      compilerOptions: {
        baseUrl: repositoryRoot,
        paths: {
          "@bunwire/core": ["packages/core/src/index.ts"],
          "@bunwire/electrobun": ["packages/electrobun/src/index.ts"],
        },
      },
    });
    const controller = result.analysis.classes.find(({ name }) => name === "UserController");
    const get = controller?.methods.find(({ name }) => name === "get");
    const selected = controller?.methods.find(({ name }) => name === "selected");

    expect(get).toMatchObject({ kind: { id: "electrobun.route" }, data: { path: " /get/ " } });
    expect(selected).toMatchObject({ kind: { id: "electrobun.message" }, data: { path: "selected/" } });
    expect(get?.parameters.map((parameter) => parameter.source === "transport"
      ? [parameter.methodIndex, parameter.source, parameter.argumentIndex]
      : parameter.source === "container"
        ? [parameter.methodIndex, parameter.source, parameter.token.symbolName]
        : [parameter.methodIndex, parameter.source, parameter.resolverId])).toEqual([
      [0, "transport", 0],
      [1, "container", "UserService"],
      [2, "container", "CACHE"],
      [3, "resolver", "electrobun.window"],
    ]);
    expect(controller?.methods.map(({ name }) => name)).toEqual(["get", "selected", "inferredName"]);
    expect(await readFile(path.join(fixtureRoot, "src/application.ts"), "utf8")).not.toContain("@Arg");

    const generated = generateRuntimeRegistryModule({
      analysis: result.analysis,
      extensions: result.extensions,
      modulePath: path.join(fixtureRoot, ".generated/registry.ts"),
    });
    expect(generated.code).toContain('import { Route as');
    expect(generated.code).toContain('import { Message as');
    expect(generated.code).toMatch(/kind: __bunwire_import_\d+\.definition\.kind/);
    expect(generated.code).toContain('resolverId: createParameterResolverId("electrobun.window")');
    expect(generated.code).toContain('argumentIndex: 0');
  });

  it("normalizes Controller prefixes, explicit paths, and inferred method names deterministically", () => {
    expect(normalizeElectrobunPath(" /users// ", " /get/ ", "ignored")).toBe("users/get");
    expect(normalizeElectrobunPath("users/", undefined, "inferredName")).toBe("users/inferredName");
    expect(() => normalizeElectrobunPath("users", "../escape", "get")).toThrow(/may not contain/i);
  });
});

describe.sequential("Milestone 11 — Electrobun runtime", () => {
  it("creates the native host with real constructor options and exposes exact native callback objects", async () => {
    let callbackWindow: ElectrobunWindow | undefined;
    let callbackRpc: ElectrobunRPC | undefined;
    const app = configuredApp(new ElectrobunAdapter({
      mainWindow: {
        title: "Native Title",
        x: 11,
        y: 12,
        width: 1200,
        height: 800,
        activate: false,
        configure: (window) => { callbackWindow = window; },
      },
      rpc: { configure: (rpc) => { callbackRpc = rpc; } },
    }));

    await app.start();
    const context = app.rootContainer.get(ELECTROBUN_CONTEXT);
    const nativeWindow = context.window as unknown as BrowserWindow;
    expect(nativeWindow).toBeInstanceOf(BrowserWindow);
    expect(context.webview).toBe(nativeWindow.webview);
    expect(context.rpc).toBe(nativeWindow.webview.rpc);
    expect(callbackWindow).toBe(context.window);
    expect(callbackRpc).toBe(context.rpc);
    expect(fakeRpc(callbackRpc as ElectrobunRPC).transport).toEqual({ nativeWebviewId: context.webview.id });
    expect(nativeWindow.frame).toEqual({ x: 11, y: 12, width: 1200, height: 800 });
    expect(nativeWindow.options).toMatchObject({
      title: "Native Title",
      url: "views://mainview/index.html",
      hidden: true,
      activate: false,
    });
    expect(nativeWindow.visible).toBe(true);
    expect(nativeWindow.active).toBe(false);
  });

  it("stores context and native bindings before application Provider registration and gates early traffic", async () => {
    const app = configuredApp(new ElectrobunAdapter({ mainWindow: { hidden: true } }));
    await app.start();
    const observation = providerObservations[0];
    expect(observation?.context).toBe(app.rootContainer.get(APPLICATION_CONTEXT));
    expect(observation?.contextBinding).toBe(observation?.context);
    expect(observation?.windowBinding).toBe((observation?.context as ElectrobunContext).window);
    expect(observation?.earlyTrafficError).toBeInstanceOf(ElectrobunTrafficNotReadyError);
    expect(observation?.earlyMessageError).toBeInstanceOf(ElectrobunTrafficNotReadyError);
  });

  it("registers adapter Providers before application Providers independent of fluent call order", async () => {
    const app = defineApp()
      .withProviders(RuntimeProvider)
      .withAdapter(new ElectrobunAdapter({ mainWindow: { hidden: true } }))
      .withRuntimeRegistry(runtimeRegistry());
    await app.start();
    expect(providerObservations[0]?.contextBinding).toBe(app.rootContainer.get(ELECTROBUN_CONTEXT));
    expect(providerObservations[0]?.windowBinding).toBe(app.rootContainer.get(ELECTROBUN_WINDOW));
  });

  it("dispatches a request through Provider boot, compact caller arguments, injections, and return handling", async () => {
    const app = configuredApp(new ElectrobunAdapter({ mainWindow: { title: "Requests", hidden: true } }));
    await app.start();
    const context = app.rootContainer.get(ELECTROBUN_CONTEXT);
    await expect(fakeRpc(context.rpc).receiveRequest("users/get", { args: ["42"] }))
      .resolves.toBe(`service:42|cache:42|Requests|${context.webview.id}|true`);
  });

  it("dispatches messages without a response contract and does not expose undecorated methods", async () => {
    const app = configuredApp(new ElectrobunAdapter({ mainWindow: { title: "Messages", hidden: true } }));
    await app.start();
    const context = app.rootContainer.get(ELECTROBUN_CONTEXT);
    const result = fakeRpc(context.rpc).receiveMessage("users/selected", { args: ["7"] });
    expect(result).toBeUndefined();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(app.rootContainer.get(RuntimeController).messages).toEqual(["7:Messages"]);
    expect(() => fakeRpc(context.rpc).receiveRequest("users/ordinary", { args: [] }))
      .toThrow(/no Bunwire Electrobun request endpoint/i);
  });

  it("uses an existing native context in manual mode and preserves native outgoing communication", async () => {
    const fallbackCalls: Array<{ method: string; payload: unknown }> = [];
    const fallbackRequestHandler = (method: string, payload: unknown): string => {
      fallbackCalls.push({ method, payload });
      return `native:${method}`;
    };
    const context = createManualNativeContext(fallbackRequestHandler);
    const nativeMessages: Array<{ method: string; payload: unknown }> = [];
    context.rpc.addMessageListener("*", (method, payload) => {
      nativeMessages.push({ method, payload });
    });
    const app = configuredApp(new ManualElectrobunAdapter({
      fallbackRequestHandler,
    })).withContext(context);
    await app.start();
    await expect(fakeRpc(context.rpc).receiveRequest("users/get", { args: ["manual"] }))
      .resolves.toContain("service:manual|cache:manual|Existing");
    expect(fakeRpc(context.rpc).receiveRequest("native/existing", { untouched: true }))
      .toBe("native:native/existing");
    expect(fallbackCalls).toEqual([
      { method: "native/existing", payload: { untouched: true } },
    ]);
    nativeMessages.length = 0;
    fakeRpc(context.rpc).receiveMessage("native/event", { untouched: true });
    expect(nativeMessages).toEqual([
      { method: "native/event", payload: { untouched: true } },
    ]);
    context.rpc.send("webview/notice", { ready: true });
    await context.rpc.request("webview/query", { id: 1 });
    expect(fakeRpc(context.rpc).outgoingMessages).toEqual([
      { method: "webview/notice", payload: { ready: true } },
    ]);
    expect(fakeRpc(context.rpc).outgoingRequests).toEqual([
      { method: "webview/query", payload: { id: 1 } },
    ]);
  });

  it("decodes the private Electrobun wire payload for zero, optional, rest, and array parameters", async () => {
    const app = configuredApp(new ElectrobunAdapter({ mainWindow: { hidden: true } }));
    await app.start();
    const rpc = fakeRpc(app.rootContainer.get(ELECTROBUN_CONTEXT).rpc);

    await expect(rpc.receiveRequest("users/zero", { args: [] })).resolves.toBe("zero");
    await expect(rpc.receiveRequest("users/many", { args: ["required"] })).resolves.toBe("required:omitted");
    await expect(rpc.receiveRequest("users/many", { args: ["required", "optional"] }))
      .resolves.toBe("required:optional");
    await expect(rpc.receiveRequest("users/rest", { args: ["prefix", "a", "b"] }))
      .resolves.toBe("prefix:a,b");
    await expect(rpc.receiveRequest("users/array", { args: [["a", "b"]] }))
      .resolves.toBe("a|b");
  });

  it("rejects malformed managed payloads before Controller invocation", async () => {
    const app = configuredApp(new ElectrobunAdapter({ mainWindow: { hidden: true } }));
    await app.start();
    const rpc = fakeRpc(app.rootContainer.get(ELECTROBUN_CONTEXT).rpc);

    for (const payload of [undefined, "legacy", ["legacy"], {}, { args: "not-an-array" }]) {
      expect(() => rpc.receiveRequest("users/zero", payload)).toThrow(/wire payload.*args.*array/i);
    }
    expect(() => rpc.receiveMessage("users/selected", { args: "not-an-array" }))
      .toThrow(/wire payload.*args.*array/i);
    expect(app.rootContainer.get(RuntimeController).messages).toEqual([]);
  });

  it("rejects unknown manual requests when no fallback is configured", async () => {
    const context = createManualNativeContext();
    const app = configuredApp(new ManualElectrobunAdapter()).withContext(context);
    await app.start();
    expect(() => fakeRpc(context.rpc).receiveRequest("native/missing", { raw: true }))
      .toThrow(/no Bunwire Electrobun request endpoint/i);
  });

  it("fails closed for wrong integration mode, malformed native context, and duplicate normalized endpoints", async () => {
    const existing = createManualNativeContext();
    await expect(configuredApp(new ElectrobunAdapter()).withContext(existing).start())
      .rejects.toThrow(/ManualElectrobunAdapter/);
    await expect(defineApp().withAdapter(new ManualElectrobunAdapter()).withContext({}).start())
      .rejects.toBeInstanceOf(ElectrobunAdapterError);

    const duplicate = defineManagedMethodPlan({
      kind: ELECTROBUN_ROUTE_KIND,
      ownerKind: CONTROLLER_KIND,
      target: RuntimeController,
      method: "duplicateGet",
      data: { path: "get" },
      parameters: [],
    });
    const app = defineApp()
      .withAdapter(new ElectrobunAdapter({ mainWindow: { hidden: true } }))
      .withRuntimeRegistry(runtimeRegistry([routePlan, duplicate]));
    await expect(app.start()).rejects.toThrow(/Duplicate Electrobun request endpoint "users\/get"/);
  });

  it("keeps Core and Vite free of Electrobun-specific branches", async () => {
    const files = [
      path.join(repositoryRoot, "packages/core/src"),
      path.join(repositoryRoot, "packages/vite/src"),
    ];
    const productionFiles = (await Promise.all(files.map(async (root) => {
      const { execFile } = await import("node:child_process");
      return await new Promise<string>((resolve, reject) => {
        execFile("rg", ["-l", "electrobun|BrowserWindow", root], (error, stdout) => {
          if (error && (error as NodeJS.ErrnoException & { code?: number }).code !== 1) reject(error);
          else resolve(stdout);
        });
      });
    }))).join("");
    expect(productionFiles).toBe("");

    const packageJson = JSON.parse(await readFile(
      path.join(repositoryRoot, "packages/electrobun/package.json"),
      "utf8",
    )) as { dependencies: Record<string, string> };
    const runtimeSource = await readFile(
      path.join(repositoryRoot, "packages/electrobun/src/runtime.ts"),
      "utf8",
    );
    expect(packageJson.dependencies.electrobun).toBe("1.18.1");
    expect(runtimeSource).toContain('const nativeModuleSpecifier = "electrobun/bun"');
    expect(runtimeSource).toContain("native.BrowserView.defineRPC");
    expect(runtimeSource).toContain("new native.BrowserWindow");
  });
});
