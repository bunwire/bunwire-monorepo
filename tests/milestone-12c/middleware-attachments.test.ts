import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  defineApp,
  type MiddlewareAttachment,
  type RuntimeRegistry,
} from "@bunwire/core";
import { ELECTROBUN_ROUTE_KIND, ElectrobunAdapter } from "@bunwire/electrobun";
import {
  aggregateCompilerExtensions,
  analyzeBunwireProgram,
  generateRuntimeRegistryModule,
} from "@bunwire/vite";
import { AttachmentController, legacyCallback } from "../fixtures/milestone-12c-attachments/valid/controller.js";
import { AuditMiddleware, AuthMiddleware } from "../fixtures/milestone-12c-attachments/valid/middleware.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/milestone-12c-attachments");
const generatedPath = path.join(fixtureRoot, "registry.generated.ts");
const validFiles = ["valid/reexports.ts", "valid/middleware.ts", "valid/controller.ts"] as const;
const extensions = aggregateCompilerExtensions(ElectrobunAdapter.compiler);

function fixturePath(relativePath: string): string { return path.join(fixtureRoot, relativePath); }
function analyze(files: readonly string[] = validFiles) {
  return analyzeBunwireProgram({
    projectRoot: repositoryRoot,
    sourceFiles: files.map(fixturePath),
    extensions,
    compilerOptions: {
      baseUrl: repositoryRoot,
      paths: {
        "@bunwire/core": ["packages/core/src/index.ts"],
        "@bunwire/electrobun": ["packages/electrobun/src/index.ts"],
        "electrobun/bun": ["tests/fixtures/milestone-11-electrobun/fake-native.ts"],
      },
    },
  });
}

let generatedCode = "";
let generatedRegistry: RuntimeRegistry;

beforeAll(async () => {
  const generated = generateRuntimeRegistryModule({
    analysis: analyze(),
    extensions,
    modulePath: generatedPath,
  });
  generatedCode = generated.code;
  await fs.writeFile(generatedPath, generated.code, "utf8");
  generatedRegistry = (await import(`${pathToFileURL(generatedPath).href}?hash=${generated.hash}`) as {
    applicationRegistry: RuntimeRegistry;
  }).applicationRegistry;
});

afterAll(async () => { await fs.unlink(generatedPath).catch(() => undefined); });

function attachments(method: PropertyKey): readonly MiddlewareAttachment[] {
  const plan = generatedRegistry.methods.find((candidate) => candidate.method === method);
  return (plan?.middleware.filter((entry): entry is MiddlewareAttachment => typeof entry !== "function") ?? []);
}

describe("Middleware Redesign 12C — local attachment analysis", () => {
  it("retains Controller metadata while exposing the 12D-normalized method order", () => {
    const analysis = analyze();
    const controller = analysis.classes.find(({ name }) => name === "AttachmentController");
    expect(controller?.middleware.map(({ target, parameters }) => [target.symbolName, parameters])).toEqual([
      ["AuthMiddleware", []],
      ["AuditMiddleware", []],
    ]);
    expect(controller?.methods.find(({ name }) => name === "ordered")?.middleware.map((entry) => (
      entry.source === "callback"
        ? [entry.source, entry.target.symbolName]
        : [entry.target.symbolName, entry.parameters]
    ))).toEqual([
      ["AuthMiddleware", []],
      ["AuditMiddleware", []],
      ["AuditMiddleware", ["admin", "user"]],
      ["AuthMiddleware", ["method:scope"]],
    ]);
  });

  it("emits Controller-first canonical attachments, deduplicates exact records, and retains callbacks", () => {
    expect(attachments("ordered").map(({ target, parameters }) => [target.name, parameters])).toEqual([
      ["AuthMiddleware", []],
      ["AuditMiddleware", []],
      ["AuditMiddleware", ["admin", "user"]],
      ["AuthMiddleware", ["method:scope"]],
    ]);
    expect(attachments("repeated").filter(({ target }) => target === AuthMiddleware)).toHaveLength(1);
    const legacy = generatedRegistry.methods.find(({ method }) => method === "legacy");
    expect(legacy?.middleware).toContain(legacyCallback);
    expect(legacy?.middleware.slice(0, 2).every((entry) => typeof entry !== "function")).toBe(true);
  });

  it("generates byte-stable resolved records without alias strings", () => {
    const firstAnalysis = analyze();
    const first = generateRuntimeRegistryModule({ analysis: firstAnalysis, extensions, modulePath: generatedPath });
    const second = generateRuntimeRegistryModule({
      analysis: Object.freeze({ ...firstAnalysis, classes: Object.freeze([...firstAnalysis.classes].reverse()) }),
      extensions,
      modulePath: generatedPath,
    });
    expect(second.code).toBe(first.code);
    expect(second.hash).toBe(first.hash);
    expect(first.code).toContain("defineMiddlewareAttachment");
    expect(first.code).toContain('["admin", "user"]');
    expect(first.code).not.toContain('defineMiddlewareAttachment("auth"');

    const withoutManagedMethods = generateRuntimeRegistryModule({
      analysis: Object.freeze({
        ...firstAnalysis,
        classes: Object.freeze(firstAnalysis.classes.map((entry) => (
          entry.target.symbolName === "AttachmentController"
            ? Object.freeze({ ...entry, methods: Object.freeze([]) })
            : entry
        ))),
      }),
      extensions,
      modulePath: generatedPath,
    });
    expect(withoutManagedMethods.code).not.toContain("defineMiddlewareAttachment");
  });

  it("never imports or executes middleware and Controller modules during analysis or generation", () => {
    const analysis = analyze(["analysis-only.ts"]);
    expect(() => generateRuntimeRegistryModule({
      analysis,
      extensions,
      modulePath: generatedPath,
    })).not.toThrow();
    expect(analysis.classes.find(({ name }) => name === "NeverLoadedController")?.middleware)
      .toHaveLength(1);
  });

  it("passes semantic typechecking and the Core runtime registry boundary", async () => {
    const program = ts.createProgram({
      rootNames: [generatedPath, ...validFiles.map(fixturePath)],
      options: {
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
          "@bunwire/electrobun": ["packages/electrobun/src/index.ts"],
          "electrobun/bun": ["tests/fixtures/milestone-11-electrobun/fake-native.ts"],
        },
      },
    });
    expect(ts.getPreEmitDiagnostics(program).map((diagnostic) => (
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    ))).toEqual([]);
    const app = defineApp()
      .withManagedMethodKind(ELECTROBUN_ROUTE_KIND)
      .withRuntimeRegistry(generatedRegistry);
    await app.start();
    expect(app.rootContainer.get(AttachmentController)).toBeInstanceOf(AttachmentController);
    expect(attachments("ordered").every(({ parameters }) => Object.isFrozen(parameters))).toBe(true);
    expect(attachments("ordered").some(({ target }) => target === AuditMiddleware)).toBe(true);
  });
});
