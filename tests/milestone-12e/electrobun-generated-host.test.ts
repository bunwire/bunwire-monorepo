import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defineApp, type RuntimeRegistry } from "@bunwire/core";
import {
  ELECTROBUN_CONTEXT,
  ElectrobunAdapter,
  ManualElectrobunAdapter,
  defineElectrobunContext,
  type ElectrobunContext,
  type ElectrobunRPC,
  type ElectrobunWindow,
} from "@bunwire/electrobun";
import {
  aggregateCompilerExtensions,
  analyzeBunwireProgram,
  generateRuntimeRegistryModule,
} from "@bunwire/vite";
import { GeneratedInvocationProvider } from "../fixtures/milestone-12e-generated/application.js";
import { generatedEvents } from "../fixtures/milestone-12e-generated/middleware.js";
import { BrowserView, BrowserWindow, type FakeElectrobunRPC } from "../fixtures/milestone-11-electrobun/fake-native.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/milestone-12e-generated");
const generatedPath = path.join(fixtureRoot, "registry.generated.ts");
const sourceFiles = ["middleware.ts", "application.ts"].map((file) => path.join(fixtureRoot, file));
const compilerOptions: ts.CompilerOptions = {
  baseUrl: repositoryRoot,
  paths: {
    "@bunwire/core": ["packages/core/src/index.ts"],
    "@bunwire/electrobun": ["packages/electrobun/src/index.ts"],
    "electrobun/bun": ["tests/fixtures/milestone-11-electrobun/fake-native.ts"],
  },
};

let registry: RuntimeRegistry;
let generatedCode = "";

beforeAll(async () => {
  const extensions = aggregateCompilerExtensions(ElectrobunAdapter.compiler);
  const analysis = analyzeBunwireProgram({
    projectRoot: repositoryRoot,
    sourceFiles,
    sourceRoots: [fixtureRoot],
    bootstrapPath: path.join(fixtureRoot, "bootstrap.ts"),
    compilerOptions,
    extensions,
  });
  const generated = generateRuntimeRegistryModule({ analysis, extensions, modulePath: generatedPath });
  generatedCode = generated.code;
  await fs.writeFile(generatedPath, generated.code, "utf8");
  registry = (await import(`${pathToFileURL(generatedPath).href}?hash=${generated.hash}`) as {
    applicationRegistry: RuntimeRegistry;
  }).applicationRegistry;
});

afterAll(async () => { await fs.unlink(generatedPath).catch(() => undefined); });

beforeEach(() => {
  generatedEvents.length = 0;
  BrowserWindow.instances.length = 0;
});

function rpc(value: ElectrobunRPC): FakeElectrobunRPC {
  return value as unknown as FakeElectrobunRPC;
}

function manualContext(): ElectrobunContext {
  const nativeRpc = BrowserView.defineRPC({ handlers: { requests: {}, messages: {} } });
  return defineElectrobunContext(new BrowserWindow({ title: "Manual Generated", rpc: nativeRpc }) as unknown as ElectrobunWindow);
}

async function turn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe.sequential("Middleware Redesign 12E — compiler-generated Electrobun hosts", () => {
  it("loads one normalized generated registry with no unresolved policy data", () => {
    expect(generatedCode).toContain("defineMiddlewareAttachment");
    expect(generatedCode).not.toContain("withMiddlewares");
    expect(generatedCode).not.toContain('"generated:policy"');
    expect(registry.methods.every((plan) => plan.middleware.every((entry) => typeof entry !== "string"))).toBe(true);
  });

  it.each(["normal", "manual"] as const)("executes generated DI policy in the %s host", async (host) => {
    const context = host === "manual" ? manualContext() : undefined;
    const app = defineApp()
      .withAdapter(host === "manual"
        ? new ManualElectrobunAdapter()
        : new ElectrobunAdapter({ mainWindow: { title: "Normal Generated", hidden: true } }))
      .withProviders(GeneratedInvocationProvider)
      .withRuntimeRegistry(registry);
    if (context) app.withContext(context);
    await app.start();
    const native = app.rootContainer.get(ELECTROBUN_CONTEXT);

    await expect(rpc(native.rpc).receiveRequest("generated/run", { args: [host] }))
      .resolves.toBe(`generated(${host})`);
    await expect(rpc(native.rpc).receiveRequest("generated/short", { args: [] }))
      .resolves.toBe("generated(short:fixture)");
    rpc(native.rpc).receiveMessage("generated/event", { args: [host] });
    await turn();

    expect(generatedEvents).not.toContain("controller:short");
    expect(generatedEvents).toContainEqual(expect.stringMatching(/^middleware:request:generated\/run:policy:\d+:true$/));
    expect(generatedEvents).toContainEqual(expect.stringMatching(/^middleware:message:generated\/event:policy:\d+:true$/));
    const ids = generatedEvents.flatMap((event) => event.match(/:(\d+)(?::|$)/)?.[1] ?? []);
    expect(ids.length).toBeGreaterThan(0);
  });
});
