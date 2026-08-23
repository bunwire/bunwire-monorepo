import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MIDDLEWARE_KIND,
  Middleware,
  defineAdapterCompilerDescriptor,
  defineApp,
  type RuntimeRegistry,
} from "@bunwire/core";
import {
  aggregateCompilerExtensions,
  analyzeBunwireProgram,
  generateRuntimeRegistryModule,
} from "@bunwire/vite";
import {
  FullMetadataMiddleware,
  InheritedHandleMiddleware,
  PartialMetadataMiddleware,
} from "../fixtures/milestone-12b-middleware/valid/middleware.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/milestone-12b-middleware");
const generatedPath = path.join(fixtureRoot, "registry.generated.ts");
const validFiles = [
  "valid/dependencies.ts",
  "valid/reexports.ts",
  "valid/middleware.ts",
] as const;
const descriptor = defineAdapterCompilerDescriptor({ id: "fixture.middleware-compiler" });
const extensions = aggregateCompilerExtensions(descriptor);

function fixturePath(relativePath: string): string {
  return path.join(fixtureRoot, relativePath);
}

function analyze(...relativePaths: readonly string[]) {
  return analyzeBunwireProgram({
    projectRoot: repositoryRoot,
    sourceFiles: relativePaths.map(fixturePath),
    extensions,
    compilerOptions: {
      baseUrl: repositoryRoot,
      paths: {
        "@bunwire/core": ["packages/core/src/index.ts"],
      },
    },
  });
}

function analyzeValid() {
  return analyze(...validFiles);
}

function expectCompilerFailure(
  relativePaths: readonly string[],
  code: string,
  message: RegExp,
): void {
  try {
    analyze(...relativePaths);
  } catch (error) {
    expect(error).toMatchObject({
      code,
      message: expect.stringMatching(message),
      location: expect.objectContaining({
        filePath: expect.any(String),
        line: expect.any(Number),
        column: expect.any(Number),
      }),
    });
    return;
  }
  throw new Error(`Expected ${relativePaths.join(", ")} to fail with ${code}.`);
}

let generatedRegistry: RuntimeRegistry;
let generatedCode: string;

beforeAll(async () => {
  const analysis = analyzeValid();
  const generated = generateRuntimeRegistryModule({
    analysis,
    extensions,
    modulePath: generatedPath,
  });
  generatedCode = generated.code;
  await fs.writeFile(generatedPath, generated.code, "utf8");
  const loaded = await import(`${pathToFileURL(generatedPath).href}?hash=${generated.hash}`) as {
    readonly applicationRegistry: RuntimeRegistry;
  };
  generatedRegistry = loaded.applicationRegistry;
});

afterAll(async () => {
  await fs.unlink(generatedPath).catch(() => undefined);
});

describe("Middleware Redesign 12B — discovery and metadata", () => {
  it("registers the canonical Core middleware kind and exact compiler symbol", () => {
    expect(extensions.classKinds).toContain(MIDDLEWARE_KIND);
    expect(extensions.classDecorators).toContain(Middleware.definition);
    expect(Middleware.definition.compilerSymbol).toEqual({
      moduleSpecifier: "@bunwire/core",
      exportName: "Middleware",
    });
  });

  it("recognizes canonical aliases and re-exports and compiles literal metadata", () => {
    const analysis = analyzeValid();
    const full = analysis.classes.find(({ name }) => name === "FullMetadataMiddleware");
    const partial = analysis.classes.find(({ name }) => name === "PartialMetadataMiddleware");
    const inherited = analysis.classes.find(({ name }) => name === "InheritedHandleMiddleware");

    expect(full).toMatchObject({
      kind: MIDDLEWARE_KIND,
      decoratorId: "core.middleware.decorator",
      data: {
        scope: "transient",
        alias: " auth ",
        include: ["/admin/**", "/account/*"],
        exclude: ["/admin/login"],
        only: ["request"],
      },
      constructor: { parameterCount: 2 },
    });
    expect(full?.constructor?.dependencies.map(({ index, explicit, token }) => ({
      index,
      explicit,
      token: token.symbolName,
    }))).toEqual([
      { index: 0, explicit: false, token: "AuthService" },
      { index: 1, explicit: true, token: "AUDIT_SINK" },
    ]);
    expect(partial?.data).toEqual({ scope: "transient", except: ["message"] });
    expect(inherited?.data).toEqual({ scope: "transient", alias: "inherited" });
    expect(analysis.classes.every(({ methods }) => methods.length === 0)).toBe(true);
  });

  it("rejects a same-ID counterfeit middleware decorator", () => {
    expectCompilerFailure(
      ["invalid-counterfeit.ts"],
      "DECORATOR_IDENTITY_CONFLICT",
      /claims registered ID.*core\.middleware\.decorator.*not the canonical/i,
    );
  });
});

describe("Middleware Redesign 12B — deterministic generated definitions", () => {
  it("emits byte-stable canonical middleware definitions regardless of analysis order", () => {
    const analysis = analyzeValid();
    const first = generateRuntimeRegistryModule({ analysis, extensions, modulePath: generatedPath });
    const reversed = generateRuntimeRegistryModule({
      analysis: Object.freeze({
        ...analysis,
        classes: Object.freeze([...analysis.classes].reverse()),
      }),
      extensions,
      modulePath: generatedPath,
    });

    expect(reversed.code).toBe(first.code);
    expect(reversed.hash).toBe(first.hash);
    expect(first.code).toContain("defineMiddlewareDefinition");
    expect(first.code).toContain('data: { "alias": " auth ", "exclude": ["/admin/login"], "include": ["/admin/**", "/account/*"], "only": ["request"] }');
    expect(first.code).toContain("dependencies: [{ index: 0, token:");
    expect(first.code).not.toContain("middlewareDefinitions:");
  });

  it("generates TypeScript that passes a real semantic typecheck", () => {
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
        },
      },
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    expect(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      "\n",
    ))).toEqual([]);
  });

  it("loads through the 12A runtime boundary with transient immutable metadata", async () => {
    const entries = generatedRegistry.classes.filter(({ kind }) => kind === MIDDLEWARE_KIND);
    expect(entries).toHaveLength(3);
    expect(entries.every(({ scope }) => scope === "transient")).toBe(true);
    expect(entries.every(({ data, dependencies }) => (
      Object.isFrozen(data) && Object.isFrozen(dependencies)
    ))).toBe(true);

    const app = defineApp().withRuntimeRegistry(generatedRegistry);
    await app.start();
    const first = app.rootContainer.get(PartialMetadataMiddleware);
    const second = app.rootContainer.get(PartialMetadataMiddleware);
    expect(first).toBeInstanceOf(PartialMetadataMiddleware);
    expect(first).not.toBe(second);
    expect(entries.find(({ target }) => target === FullMetadataMiddleware)?.data).toMatchObject({
      alias: " auth ",
      scope: "transient",
    });
    expect(entries.find(({ target }) => target === InheritedHandleMiddleware)?.data).toMatchObject({
      alias: "inherited",
      scope: "transient",
    });
  });
});
