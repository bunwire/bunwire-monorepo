import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type MiddlewareAttachment, type RuntimeRegistry } from "@bunwire/core";
import { ElectrobunAdapter } from "@bunwire/electrobun";
import {
  aggregateCompilerExtensions,
  analyzeBunwireProgram,
  generateRuntimeRegistryModule,
} from "@bunwire/vite";
import { AdminController } from "../fixtures/milestone-12d-policy/valid/controllers/admin.js";
import { PublicController } from "../fixtures/milestone-12d-policy/valid/controllers/public.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/milestone-12d-policy");
const validRoot = path.join(fixtureRoot, "valid");
const bootstrapPath = path.join(validRoot, "bootstrap.ts");
const generatedPath = path.join(fixtureRoot, "registry.generated.ts");
const sourceFiles = [
  "middleware.ts",
  "controllers/admin.ts",
  "controllers/public.ts",
].map((file) => path.join(validRoot, file));
const extensions = aggregateCompilerExtensions(ElectrobunAdapter.compiler);
const compilerOptions: ts.CompilerOptions = {
  baseUrl: repositoryRoot,
  paths: {
    "@bunwire/core": ["packages/core/src/index.ts"],
    "@bunwire/electrobun": ["packages/electrobun/src/index.ts"],
    "electrobun/bun": ["tests/fixtures/milestone-11-electrobun/fake-native.ts"],
  },
};

function analyze() {
  return analyzeBunwireProgram({
    projectRoot: repositoryRoot,
    sourceFiles,
    bootstrapPath,
    sourceRoots: [path.join(validRoot, "controllers"), validRoot],
    extensions,
    compilerOptions,
  });
}

function pipeline(analysis: ReturnType<typeof analyze>, controllerName: string) {
  const controller = analysis.classes.find(({ name }) => name === controllerName);
  return controller?.methods[0]?.middleware.map((entry) => (
    [entry.target.symbolName, [...entry.parameters]]
  ));
}

let generatedCode = "";
let registry: RuntimeRegistry;

beforeAll(async () => {
  const generated = generateRuntimeRegistryModule({ analysis: analyze(), extensions, modulePath: generatedPath });
  generatedCode = generated.code;
  await fs.writeFile(generatedPath, generated.code, "utf8");
  registry = (await import(`${pathToFileURL(generatedPath).href}?hash=${generated.hash}`) as {
    applicationRegistry: RuntimeRegistry;
  }).applicationRegistry;
});

afterAll(async () => { await fs.unlink(generatedPath).catch(() => undefined); });

describe("Middleware Redesign 12D — policy normalization", () => {
  it("expands forward and nested groups and composes all four scopes in order", () => {
    expect(pipeline(analyze(), "AdminController")).toEqual([
      ["AuthMiddleware", []],
      ["AuditMiddleware", []],
      ["TraceMiddleware", []],
      ["AuthMiddleware", ["mapped"]],
      ["AuthMiddleware", ["local"]],
      ["AuditMiddleware", ["local-group"]],
      ["AuthMiddleware", ["method"]],
      ["MethodAuditMiddleware", []],
    ]);
    expect(pipeline(analyze(), "PublicController")).toEqual([
      ["AuthMiddleware", []],
      ["AuditMiddleware", []],
      ["TraceMiddleware", []],
    ]);
  });

  it("deduplicates exact managed attachments while retaining distinct parameters", () => {
    const entries = analyze().classes.find(({ name }) => name === "AdminController")?.methods[0]?.middleware ?? [];
    expect(entries.filter((entry) => entry.source === "attachment" && entry.target.symbolName === "TraceMiddleware"))
      .toHaveLength(1);
    expect(entries.filter((entry) => entry.source === "attachment" && entry.target.symbolName === "AuthMiddleware"))
      .toHaveLength(4);
    expect(entries.at(-1)?.target.symbolName).toBe("MethodAuditMiddleware");
  });

  it("matches POSIX-normalized relative Controller paths across multiple source roots", () => {
    const analysis = analyze();
    expect(pipeline(analysis, "AdminController")?.some(([name, parameters]) => (
      name === "AuthMiddleware" && (parameters as string[])[0] === "mapped"
    ))).toBe(true);
    expect(pipeline(analysis, "PublicController")?.some(([name]) => name === "TraceMiddleware")).toBe(true);
  });

  it("emits only the normalized pipeline with no unresolved policy data", () => {
    expect(generatedCode).toContain("defineMiddlewareAttachment");
    expect(generatedCode).not.toContain("global-stack");
    expect(generatedCode).not.toContain("local-stack");
    expect(generatedCode).not.toContain("controllers/**");
    const admin = registry.methods.find(({ target }) => target === AdminController);
    const attachments: readonly MiddlewareAttachment[] = admin?.middleware ?? [];
    expect(attachments).toHaveLength(8);
    expect(admin?.middleware.at(-1)?.target.name).toBe("MethodAuditMiddleware");
    expect(registry.methods.some(({ target }) => target === PublicController)).toBe(true);
    expect(attachments.every(({ parameters }) => Object.isFrozen(parameters))).toBe(true);
  });

  it("is deterministic, semantically type-correct, and runtime-loadable", () => {
    const first = analyze();
    const generated = generateRuntimeRegistryModule({ analysis: first, extensions, modulePath: generatedPath });
    const reversed = generateRuntimeRegistryModule({
      analysis: Object.freeze({ ...first, classes: Object.freeze([...first.classes].reverse()) }),
      extensions,
      modulePath: generatedPath,
    });
    expect(reversed.code).toBe(generated.code);
    expect(reversed.hash).toBe(generated.hash);
    const program = ts.createProgram({
      rootNames: [generatedPath, ...sourceFiles],
      options: {
        ...compilerOptions,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        experimentalDecorators: true,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
    });
    expect(ts.getPreEmitDiagnostics(program).map((diagnostic) => (
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    ))).toEqual([]);
  });

  it("does not import bootstrap, application, middleware, or Controller code during analysis", () => {
    expect(() => analyzeBunwireProgram({
      projectRoot: repositoryRoot,
      sourceFiles: [path.join(fixtureRoot, "analysis-only.ts")],
      bootstrapPath: path.join(fixtureRoot, "analysis-only-bootstrap.ts"),
      sourceRoots: [fixtureRoot],
      extensions,
      compilerOptions,
    })).not.toThrow();
  });
});
