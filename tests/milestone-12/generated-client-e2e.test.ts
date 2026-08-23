import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import ts from "typescript";
import type { Application, RuntimeRegistry } from "@bunwire/core";
import {
  ELECTROBUN_CONTEXT,
  defineElectrobunContext,
  type ElectrobunContext,
} from "@bunwire/electrobun";
import {
  BUNWIRE_CLIENT_MODULE_ID,
  BUNWIRE_RESOLVED_CLIENT_MODULE_ID,
  analyzeBunwireApplication,
  bunwire,
  generateCallerContractModule,
  generateRuntimeRegistryModule,
} from "@bunwire/vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BrowserView,
  BrowserWindow,
  type FakeElectrobunRPC,
} from "../fixtures/milestone-11-electrobun/fake-native.js";
import {
  lifecycle,
  resetLifecycle,
  type DeleteResult,
  type UserResult,
} from "../fixtures/milestone-12-electrobun/src/bun/application.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/milestone-12-electrobun");
const generatedRegistryPath = path.join(fixtureRoot, "registry.generated.ts");
const generatedClientPath = path.join(fixtureRoot, "client.generated.ts");
const frontendContractPath = path.join(fixtureRoot, "src/frontend-contract.ts");
const frontendNativeContractPath = path.join(fixtureRoot, "src/frontend-native-contract.ts");

interface GeneratedClient {
  request(method: "users/get", id: string, includePosts?: boolean): Promise<UserResult>;
  request(method: "users/deleteUsers", ids: string[], notify: boolean, ...labels: string[]): Promise<DeleteResult>;
  request(method: "users/defaulted", prefix: string | undefined, required: string): Promise<string>;
  message(method: "users/deleted", id: string): void;
}

interface GeneratedClientModule {
  createBunwireClient(transport: {
    request(method: string, payload?: unknown): Promise<unknown>;
    send(method: string, payload?: unknown): void;
  }): GeneratedClient;
}

let registry: RuntimeRegistry;
let clientModule: GeneratedClientModule;
let generatedClientCode: string;

function compilerOptions(): ts.CompilerOptions {
  return {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    experimentalDecorators: true,
    strict: true,
    exactOptionalPropertyTypes: true,
    noEmit: true,
    skipLibCheck: true,
    baseUrl: repositoryRoot,
    paths: {
      "@bunwire/core": ["packages/core/src/index.ts"],
      "@bunwire/vite": ["packages/vite/src/index.ts"],
      "@bunwire/electrobun": ["packages/electrobun/src/index.ts"],
    },
  };
}

async function analyze() {
  return analyzeBunwireApplication({
    root: fixtureRoot,
    compilerOptions: compilerOptions(),
  });
}

function frontendTransport(context: ElectrobunContext) {
  const rpc = context.rpc as unknown as FakeElectrobunRPC;
  return {
    async request(method: string, payload?: unknown): Promise<unknown> {
      return await rpc.receiveRequest(method, payload);
    },
    send(method: string, payload?: unknown): void {
      rpc.receiveMessage(method, payload);
    },
  };
}

beforeAll(async () => {
  const application = await analyze();
  const generatedRegistry = generateRuntimeRegistryModule({
    analysis: application.analysis,
    extensions: application.extensions,
    modulePath: generatedRegistryPath,
  });
  const generatedClient = generateCallerContractModule({
    analysis: application.analysis,
    extensions: application.extensions,
    modulePath: generatedClientPath,
  });
  generatedClientCode = generatedClient.code;
  await Promise.all([
    fs.writeFile(generatedRegistryPath, generatedRegistry.code, "utf8"),
    fs.writeFile(generatedClientPath, generatedClient.code, "utf8"),
  ]);
  const [registryModule, loadedClient] = await Promise.all([
    import(`${pathToFileURL(generatedRegistryPath).href}?hash=${generatedRegistry.hash}`),
    import(`${pathToFileURL(generatedClientPath).href}?hash=${generatedClient.hash}`),
  ]) as [{ readonly applicationRegistry: RuntimeRegistry }, GeneratedClientModule];
  registry = registryModule.applicationRegistry;
  clientModule = loadedClient;
});

afterAll(async () => {
  await Promise.all([
    fs.unlink(generatedRegistryPath).catch(() => undefined),
    fs.unlink(generatedClientPath).catch(() => undefined),
  ]);
});

describe.sequential("Milestone 12 — generated caller contracts", () => {
  it("emits positional contracts from analyzed caller indexes without exposing the private wire payload", () => {
    expect(generatedClientCode).toContain('"users/get": (argument0: Parameters<');
    expect(generatedClientCode).toContain("argument1?: Parameters<");
    expect(generatedClientCode).toContain('"users/deleteUsers": (argument0: Parameters<');
    expect(generatedClientCode).toContain("...argument2: __bunwire_drop<Parameters<");
    expect(generatedClientCode).toContain('"users/deleted": (argument0: Parameters<');
    expect(generatedClientCode).not.toContain("{ args:");
    expect(generatedClientCode).not.toContain("ElectrobunInvocationPayload");
  });

  it("passes a real semantic typecheck for valid calls and all expected caller-boundary errors", () => {
    const program = ts.createProgram({
      rootNames: [generatedClientPath, frontendContractPath],
      options: compilerOptions(),
    });
    expect(ts.getPreEmitDiagnostics(program).map((diagnostic) => (
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    ))).toEqual([]);
  });

  it("integrates the generated schema and client with the pinned native Electrobun frontend API", () => {
    const program = ts.createProgram({
      rootNames: [generatedClientPath, frontendNativeContractPath],
      options: {
        ...compilerOptions(),
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
    });
    const ownedPaths = new Set([
      path.normalize(generatedClientPath),
      path.normalize(frontendNativeContractPath),
    ]);
    const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) => (
      diagnostic.file && ownedPaths.has(path.normalize(diagnostic.file.fileName))
    ));
    expect(diagnostics.map((diagnostic) => (
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    ))).toEqual([]);
  });

  it("serves the generated client through the reserved Vite virtual-module path", async () => {
    const plugin = bunwire({ root: fixtureRoot, compilerOptions: compilerOptions() });
    expect(plugin.resolveId(BUNWIRE_CLIENT_MODULE_ID)).toBe(BUNWIRE_RESOLVED_CLIENT_MODULE_ID);
    await expect(plugin.load(BUNWIRE_RESOLVED_CLIENT_MODULE_ID)).resolves.toContain(
      "createBunwireClient",
    );
  });
});

describe.sequential("Milestone 12 — full Electrobun application", () => {
  it("runs the generated normal-host registry and positional client end to end", async () => {
    resetLifecycle();
    BrowserWindow.instances.length = 0;
    const bootstrap = await import("../fixtures/milestone-12-electrobun/src/bun/bootstrap.js") as {
      readonly default: Application<ElectrobunContext>;
      readonly nativeCallbacks: { window?: object; rpc?: object };
    };
    const app = bootstrap.default;
    expect(app.state).toBe("configuring");
    expect(BrowserWindow.instances).toHaveLength(0);
    expect(bootstrap.nativeCallbacks).toEqual({});

    app.withRuntimeRegistry(registry);
    await app.start();
    expect(app.state).toBe("running");
    const context = app.rootContainer.get(ELECTROBUN_CONTEXT);
    expect(context.window).toBeInstanceOf(BrowserWindow);
    expect(bootstrap.nativeCallbacks.window).toBe(context.window);
    expect(bootstrap.nativeCallbacks.rpc).toBe(context.rpc);
    expect(lifecycle.registerCount).toBe(1);
    expect(lifecycle.registrationContext).toBe(context);

    const client = clientModule.createBunwireClient(frontendTransport(context));
    await expect(client.request("users/get", "42", true)).resolves.toMatchObject({
      id: "42",
      database: "database:42",
      constructorService: "service:42",
      methodService: "service:42",
      cached: "cache:42",
      windowTitle: "Milestone 12",
      webviewId: context.webview.id,
      contextMatches: true,
      includePosts: true,
      middlewareApplied: true,
    });
    await expect(client.request("users/deleteUsers", ["one", "two"], true, "audit", "admin"))
      .resolves.toEqual({ ids: ["one", "two"], notify: true, labels: ["audit", "admin"] });
    await expect(client.request("users/defaulted", undefined, "required"))
      .resolves.toBe("default:required");
    expect(client.message("users/deleted", "42")).toBeUndefined();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(lifecycle.messages).toEqual(["42:Milestone 12"]);
    expect(lifecycle.bootInvocationIds).toHaveLength(4);
    expect(lifecycle.middlewareEvents).toEqual(["before:get", "after:get"]);
    expect(new Set(lifecycle.bootInvocationIds).size).toBe(4);

    await expect((client.request as (...args: unknown[]) => Promise<unknown>)("users/get"))
      .rejects.toThrow(/expects 1 to 2 caller argument.*received 0/i);
    await expect((client.request as (...args: unknown[]) => Promise<unknown>)(
      "users/get", "42", true, "extra",
    )).rejects.toThrow(/expects 1 to 2 caller argument.*received 3/i);
    expect(lifecycle.bootInvocationIds).toHaveLength(6);
    await expect(app.start()).rejects.toThrow(/only be called once/i);
  });

  it("runs the existing-host escape hatch through withContext(existingContext).start()", async () => {
    resetLifecycle();
    const rpc = BrowserView.defineRPC({ handlers: { requests: {}, messages: {} } });
    const window = new BrowserWindow({ title: "Existing Host", rpc });
    const context = defineElectrobunContext(window);
    const { default: app } = await import(
      "../fixtures/milestone-12-electrobun/src/bun/manual-bootstrap.js"
    ) as { readonly default: Application<ElectrobunContext> };
    app.withRuntimeRegistry(registry);

    await app.withContext(context).start();
    expect(app.rootContainer.get(ELECTROBUN_CONTEXT)).toBe(context);
    expect(lifecycle.registrationContext).toBe(context);
    const client = clientModule.createBunwireClient(frontendTransport(context));
    await expect(client.request("users/get", "manual")).resolves.toMatchObject({
      id: "manual",
      windowTitle: "Existing Host",
      includePosts: false,
      middlewareApplied: true,
    });
    expect(lifecycle.registerCount).toBe(1);
    expect(lifecycle.bootInvocationIds).toHaveLength(1);
    expect(lifecycle.middlewareEvents).toEqual(["before:get", "after:get"]);
  });

  it("uses generated metadata without application-owned class construction or handler tables", async () => {
    const sources = await Promise.all([
      "application.ts",
      "bootstrap.ts",
      "manual-bootstrap.ts",
    ].map((name) => fs.readFile(path.join(fixtureRoot, "src/bun", name), "utf8")));
    const applicationSource = sources.join("\n");
    expect(applicationSource).not.toMatch(/new\s+(?:DatabaseService|UserService|UserController|ApplicationProvider)\b/);
    expect(applicationSource).not.toMatch(/setRequestHandler|addMessageListener|handlerTable|handlers\s*:/);
    expect(generatedClientCode).not.toMatch(/@Window|@Webview|@Context|@Inject|UserService|CACHE/);
  });
});
