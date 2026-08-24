import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  Use,
  defineApp,
  defineManagedMethodPlan,
  type RuntimeRegistry,
} from "@bunwire/core";
import {
  aggregateCompilerExtensions,
  analyzeBunwireProgram,
  generateRuntimeRegistryModule,
} from "@bunwire/vite";
import {
  FAKE_QUEUE_COMPILER,
  FAKE_QUEUE_CONSUMER_KIND,
  Consumer,
  FakeQueueAdapter,
  type FakeQueueHost,
} from "../../examples/fake-queue-app/src/adapter.js";
import {
  auditConstructions,
  excludedConstructions,
  queueEvents,
  resetQueueFixture,
  skippedConstructions,
} from "../../examples/fake-queue-app/src/middleware.js";

if (false) {
  // @ts-expect-error Function middleware was removed in Milestone 12F.
  Use(async (_context: unknown, next: () => Promise<unknown>) => next());
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repositoryRoot, "examples/fake-queue-app/src");
const generatedPath = path.join(fixtureRoot, "registry.generated.ts");
const sourceFiles = ["middleware.ts", "application.ts"].map((file) => path.join(fixtureRoot, file));
const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  experimentalDecorators: true,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  baseUrl: repositoryRoot,
  paths: {
    "@bunwire/core": ["packages/core/src/index.ts"],
    "@bunwire/fake-queue": ["examples/fake-queue-app/src/adapter.ts"],
  },
};

let registry: RuntimeRegistry;
let generatedCode = "";

beforeAll(async () => {
  const extensions = aggregateCompilerExtensions(FAKE_QUEUE_COMPILER);
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
beforeEach(() => resetQueueFixture());

describe.sequential("Middleware Redesign 12F — final managed middleware model", () => {
  it("rejects callback references and callback-shaped plan entries at runtime", () => {
    expect(() => Use((() => undefined) as never)).toThrow(/canonical @Middleware/);
    class Target { run(): void {} }
    Consumer()(Target);
    expect(() => defineManagedMethodPlan({
      target: Target,
      ownerKind: FAKE_QUEUE_CONSUMER_KIND,
      method: "run",
      kind: FAKE_QUEUE_COMPILER.methodKinds[0]!,
      data: Object.freeze({ topic: "test" }),
      parameters: [],
      middleware: [(() => undefined) as never],
    })).toThrow(/attachment/i);
  });

  it("removes callback symbols and compiler representations from public production sources", async () => {
    const removedType = ["Managed", "Method", "Middleware"].join("");
    const corePublic = await import("@bunwire/core") as Record<string, unknown>;
    expect(corePublic).not.toHaveProperty(removedType);

    const productionFiles = [
      "packages/core/src/index.ts",
      "packages/core/src/managed-methods/plan.ts",
      "packages/core/src/managed-methods/invocation-engine.ts",
      "packages/core/src/managed-methods/middleware-decorator.ts",
      "packages/vite/src/compiler-analysis.ts",
      "packages/vite/src/registry-generator.ts",
      "packages/electrobun/src/middleware.ts",
      "examples/electrobun-app/src/bun/application.ts",
    ];
    const production = (await Promise.all(productionFiles.map((file) => (
      fs.readFile(path.join(repositoryRoot, file), "utf8")
    )))).join("\n");
    expect(production).not.toContain(removedType);
    expect(production).not.toContain("legacy-callable");
    expect(production).not.toMatch(/@Use\([^)]*Middleware\s*=\s*async/);
  });

  it("generates only canonical attachments and passes semantic TypeScript checking", () => {
    expect(generatedCode).toContain("defineMiddlewareAttachment");
    expect(generatedCode).not.toContain("typeof entry");
    expect(generatedCode).not.toContain("legacy");
    expect(registry.methods.every((plan) => plan.middleware.every((entry) => (
      typeof entry.target === "function" && Object.isFrozen(entry.parameters)
    )))).toBe(true);

    const program = ts.createProgram({
      rootNames: [generatedPath, ...sourceFiles],
      options: compilerOptions,
    });
    expect(ts.getPreEmitDiagnostics(program).map((diagnostic) => (
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    ))).toEqual([]);
  });

  it("executes compiler-generated middleware through a platform-independent second adapter", async () => {
    const host: FakeQueueHost = Object.freeze({ name: "queue-host" });
    const adapter = new FakeQueueAdapter();
    const app = defineApp()
      .withAdapter(adapter)
      .withContext(host)
      .withRuntimeRegistry(registry);
    await app.start();

    const [first, second] = await Promise.all([
      adapter.command(host, "orders.create", "one"),
      adapter.command(host, "orders.create", "two"),
    ]);
    expect([first, second]).toEqual(["audit(one)", "audit(two)"]);
    expect(auditConstructions).toBe(2);
    expect(skippedConstructions).toBe(0);
    expect(excludedConstructions).toBe(0);
    expect(queueEvents.filter((event) => event.startsWith("context:")))
      .toEqual(["context:true:true:true", "context:true:true:true"]);
    const controllers = queueEvents.filter((event) => event.startsWith("controller:"));
    expect(controllers).toHaveLength(2);
    for (const event of controllers) {
      const [, , , injectedId, resolverId, hostName] = event.split(":");
      expect(resolverId).toBe(injectedId);
      expect(hostName).toBe("queue-host");
    }

    await expect(adapter.command(host, "orders.short")).resolves.toBe("short:policy");
    expect(queueEvents).not.toContain("controller:short");
    await expect(adapter.command(host, "orders.failed")).rejects.toThrow("queue middleware failure");
    await expect(adapter.event(host, "orders.created", "created")).resolves.toBeUndefined();
    expect(queueEvents).toContain("event-middleware:orders.created:queue-host");
    expect(queueEvents).toContain("event-controller:orders.created:created");
  });

  it("keeps fake-queue transport and matching policy out of Core and generic Vite", async () => {
    const roots = ["packages/core/src", "packages/vite/src"];
    const files = (await Promise.all(roots.map(async (root) => {
      const entries = await fs.readdir(path.join(repositoryRoot, root), { recursive: true, withFileTypes: true });
      return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".ts")).map((entry) => (
        path.join(entry.parentPath, entry.name)
      ));
    }))).flat();
    const source = (await Promise.all(files.map((file) => fs.readFile(file, "utf8")))).join("\n");
    expect(source).not.toContain("fake-queue");
    expect(source).not.toContain("FakeQueue");
    expect(source).not.toContain("orders.create");
  });
});
