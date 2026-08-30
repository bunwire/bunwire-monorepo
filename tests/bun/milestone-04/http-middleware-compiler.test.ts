import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUN_COMPILER_DESCRIPTOR } from "@bunwire/bun";
import {
  aggregateCompilerExtensions,
  analyzeBunwireProgram,
  generateRuntimeRegistryModule,
} from "@bunwire/vite";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/bun-milestone-04");
const sourceFiles = [
  path.join(fixtureRoot, "middleware.ts"),
  path.join(fixtureRoot, "controllers/admin.ts"),
  path.join(fixtureRoot, "controllers/public.ts"),
];
const extensions = aggregateCompilerExtensions(BUN_COMPILER_DESCRIPTOR);
const compilerOptions = {
  baseUrl: repositoryRoot,
  paths: {
    "@bunwire/core": ["packages/core/src/index.ts"],
    "@bunwire/bun": ["packages/bun/src/index.ts"],
  },
};

function analyze(bootstrapPath = path.join(fixtureRoot, "bootstrap.ts"), files = sourceFiles) {
  return analyzeBunwireProgram({
    projectRoot: repositoryRoot,
    sourceFiles: files,
    bootstrapPath,
    sourceRoots: [path.join(fixtureRoot, "controllers"), fixtureRoot],
    extensions,
    compilerOptions,
  });
}

function analyzeWithoutBootstrap(files: readonly string[]) {
  return analyzeBunwireProgram({
    projectRoot: repositoryRoot,
    sourceFiles: files,
    sourceRoots: [fixtureRoot],
    extensions,
    compilerOptions,
  });
}

function pipeline(result: ReturnType<typeof analyze>, controller: string) {
  return result.classes.find(({ name }) => name === controller)?.methods[0]?.middleware.map((entry) => (
    [entry.target.symbolName, [...entry.parameters]]
  ));
}

describe("Bun Milestone 4 — generated HTTP middleware policy", () => {
  it("expands aliases and nested groups into deterministic four-scope order", () => {
    const result = analyze();
    expect(pipeline(result, "AdminController")).toEqual([
      ["AuthMiddleware", []],
      ["AuditMiddleware", []],
      ["TraceMiddleware", []],
      ["AuthMiddleware", ["mapped"]],
      ["AuthMiddleware", ["local"]],
      ["AuditMiddleware", ["local-group"]],
      ["AuthMiddleware", ["method"]],
      ["MethodAuditMiddleware", []],
    ]);
    expect(pipeline(result, "PublicController")).toEqual([
      ["AuthMiddleware", []],
      ["AuditMiddleware", []],
      ["TraceMiddleware", []],
    ]);
  });

  it("deduplicates exact attachments but retains Laravel-style parameter variants", () => {
    const entries = analyze().classes.find(({ name }) => name === "AdminController")!.methods[0]!.middleware;
    expect(entries.filter(({ target }) => target.symbolName === "TraceMiddleware")).toHaveLength(1);
    expect(entries.filter(({ target }) => target.symbolName === "AuthMiddleware")).toHaveLength(4);
    expect(entries.every(({ parameters }) => Object.isFrozen(parameters))).toBe(true);
  });

  it("emits canonical middleware definitions and attachments into Bun's registry", () => {
    const generated = generateRuntimeRegistryModule({
      analysis: analyze(),
      extensions,
      modulePath: path.join(fixtureRoot, "registry.generated.ts"),
    });
    expect(generated.code).toContain("defineMiddlewareDefinition");
    expect(generated.code).toContain("defineMiddlewareAttachment");
    expect(generated.code).toContain('"include": ["/api/**"]');
    expect(generated.code).toContain('"only": ["GET"]');
    expect(generated.code).not.toContain("global-stack");
    expect(generated.code).not.toContain("local-stack");
  });

  it("rejects duplicate aliases, alias/group ambiguity, cycles, and unresolved references", () => {
    expect(() => analyzeWithoutBootstrap([path.join(fixtureRoot, "invalid-duplicate-alias.ts")]))
      .toThrow(/middleware alias.*duplicate/i);
    expect(() => analyze(path.join(fixtureRoot, "invalid-ambiguity-bootstrap.ts")))
      .toThrow(/group.*auth.*collides with a middleware alias/i);
    expect(() => analyze(path.join(fixtureRoot, "invalid-cycle-bootstrap.ts")))
      .toThrow(/group cycle/i);
    expect(() => analyze(path.join(fixtureRoot, "invalid-unresolved-bootstrap.ts")))
      .toThrow(/unknown alias or group/i);
  });

  it("rejects a counterfeit @Use() symbol under the Bun compiler descriptor", () => {
    expect(() => analyzeWithoutBootstrap([
      path.join(repositoryRoot, "tests/fixtures/milestone-12c-attachments/invalid-counterfeit-use.ts"),
    ])).toThrow(/claims registered ID.*core\.use/i);
  });
});
