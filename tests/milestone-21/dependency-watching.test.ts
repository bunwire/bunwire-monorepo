import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeBunwireApplication, bunwire, generateBunwireArtifacts } from "@bunwire/vite";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceFixture = path.join(repositoryRoot, "tests/fixtures/milestone-12-electrobun");
const identity = (filePath: string): string => {
  const normalized = path.resolve(filePath).replaceAll("\\", "/");
  return ts.sys.useCaseSensitiveFileNames ? normalized : normalized.toLowerCase();
};

function compilerOptions(): ts.CompilerOptions {
  return { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, experimentalDecorators: true,
    strict: true, noEmit: true, skipLibCheck: true, baseUrl: repositoryRoot,
    paths: { "@bunwire/core": ["packages/core/src/index.ts"],
      "@bunwire/electrobun": ["packages/electrobun/src/index.ts"] } };
}

async function waitFor(check: () => Promise<boolean>, message: string, timeout = 90_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (await check()) return; } catch { /* The next watcher event may still be refreshing. */ }
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(message);
}

describe.sequential("Milestone 21 — imported dependency watching", () => {
  let root: string;
  let server: ViteDevServer | undefined;
  let clientPath: string;
  let registryPath: string;
  let shared: string;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(repositoryRoot, ".tmp-bunwire-m21-"));
    await fs.cp(sourceFixture, root, { recursive: true });
    shared = path.join(root, "shared");
    await fs.mkdir(shared);
    await fs.writeFile(path.join(shared, "values-a.ts"), [
      'import { Service } from "@bunwire/core";',
      'export const ROUTE = "getA";',
      '@Service() export class UnmanagedDependencyClass {}',
    ].join("\n"));
    await fs.writeFile(path.join(shared, "values-b.ts"), 'export const ROUTE = "getC";\n');
    await fs.writeFile(path.join(shared, "helper.ts"), [
      'import type { MiddlewarePolicyRegistry } from "@bunwire/core";',
      'export function register(r: MiddlewarePolicyRegistry) { r.use("logging"); }',
    ].join("\n"));
    await fs.writeFile(path.join(shared, "barrel.ts"), [
      'export { ROUTE } from "./values-a.js";',
      'export { register } from "./helper.js";',
    ].join("\n"));
    const applicationPath = path.join(root, "src/bun/application.ts");
    const application = await fs.readFile(applicationPath, "utf8");
    await fs.writeFile(applicationPath, 'import { ROUTE } from "../../shared/barrel.js";\n'
      + application.replace('@Route("get")', '@Route(ROUTE)') + '\n'
      + '@Middleware() export class ExtraMiddleware implements Middleware<ElectrobunMiddlewareContext> {\n'
      + '  protected alias = "extra";\n'
      + '  async handle(_context: ElectrobunMiddlewareContext, next: () => Promise<unknown>): Promise<unknown> { return next(); }\n'
      + '}\n');
    const bootstrapPath = path.join(root, "src/bun/bootstrap.ts");
    const bootstrap = await fs.readFile(bootstrapPath, "utf8");
    await fs.writeFile(bootstrapPath, 'import { register } from "../../shared/barrel.js";\n'
      + bootstrap.replace(/\}\)\);\s*$/, '})).withMiddlewares(register);\n'));
    await fs.writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: {
      experimentalDecorators: true, useDefineForClassFields: true } }));
    clientPath = path.join(root, ".bunwire/client.ts");
    registryPath = path.join(root, ".bunwire/registry.ts");
  });

  afterAll(async () => {
    await server?.close();
    if (path.dirname(root) !== repositoryRoot || !path.basename(root).startsWith(".tmp-bunwire-m21-"))
      throw new Error("Unsafe test cleanup target");
    await fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  });

  it("returns the same project-local dependencies in analysis and manual artifacts without widening discovery", async () => {
    const application = await analyzeBunwireApplication({ root, compilerOptions: compilerOptions() });
    const dependencies = application.analysis.dependencies;
    for (const name of ["values-a.ts", "helper.ts", "barrel.ts"]) {
      expect(dependencies).toContain(identity(path.join(shared, name)));
    }
    expect(application.sourceFiles).not.toContain(path.join(shared, "values-a.ts"));
    expect(application.analysis.classes.map((entry) => entry.name)).not.toContain("UnmanagedDependencyClass");
    const first = await generateBunwireArtifacts({ root, compilerOptions: compilerOptions() });
    expect(first.dependencies).toEqual(dependencies);
    expect(await fs.readFile(clientPath, "utf8")).toContain('"users/getA"');
    const before = await Promise.all([clientPath, registryPath].map(async (filePath) => (await fs.stat(filePath)).mtimeMs));
    const unchanged = await generateBunwireArtifacts({ root, compilerOptions: compilerOptions() });
    expect(unchanged.changedPaths).toEqual([]);
    expect(await Promise.all([clientPath, registryPath].map(async (filePath) => (await fs.stat(filePath)).mtimeMs))).toEqual(before);
  });

  it("refreshes real Vite modules for constants, helpers, re-exports, deletion, and restoration", async () => {
    server = await createServer({ root, configFile: false, appType: "custom",
      resolve: { alias: { "@bunwire/core": path.join(repositoryRoot, "packages/core/src/index.ts"),
        "@bunwire/electrobun": path.join(repositoryRoot, "packages/electrobun/src/index.ts") } },
      plugins: [bunwire({ root, compilerOptions: compilerOptions() })],
      server: { middlewareMode: true } });
    expect((await server.transformRequest("virtual:bunwire/client"))?.code).toContain('"users/getA"');
    const valuesA = path.join(shared, "values-a.ts");
    await fs.writeFile(valuesA, (await fs.readFile(valuesA, "utf8")).replace('"getA"', '"getB"'));
    await waitFor(async () => (await server?.transformRequest("virtual:bunwire/client"))?.code.includes('"users/getB"') === true,
      "Imported constant edit did not invalidate the Vite client.");

    const helper = path.join(shared, "helper.ts");
    await fs.writeFile(helper, (await fs.readFile(helper, "utf8")).replace('"logging"', '"extra"'));
    await waitFor(async () => (await fs.readFile(registryPath, "utf8")).includes('"extra"'),
      "Imported helper edit did not regenerate the runtime registry.");
    const helperRegistry = await fs.readFile(registryPath, "utf8");
    expect(helperRegistry).toContain('"extra"');

    const barrel = path.join(shared, "barrel.ts");
    await fs.writeFile(barrel, (await fs.readFile(barrel, "utf8")).replace("values-a.js", "values-b.js"));
    await waitFor(async () => (await server?.transformRequest("virtual:bunwire/client"))?.code.includes('"users/getC"') === true,
      "Re-export change did not refresh the Vite client.");
    const current = await analyzeBunwireApplication({ root, compilerOptions: compilerOptions() });
    expect(current.analysis.dependencies).toContain(identity(path.join(shared, "values-b.ts")));
    expect(current.analysis.dependencies).not.toContain(identity(path.join(shared, "values-a.ts")));
    const stable = (await fs.stat(clientPath)).mtimeMs;
    await fs.writeFile(valuesA, (await fs.readFile(valuesA, "utf8")).replace('"getB"', '"unused"'));
    await new Promise<void>((resolve) => setTimeout(resolve, 700));
    expect((await fs.stat(clientPath)).mtimeMs).toBe(stable);

    const valuesB = path.join(shared, "values-b.ts");
    const lastClient = await fs.readFile(clientPath, "utf8");
    await fs.unlink(valuesB);
    await waitFor(async () => {
      try { await server?.transformRequest("virtual:bunwire/client"); return false; }
      catch (error) { return error instanceof Error && /values-b|module|source|import/i.test(error.message); }
    }, "Deleting a consumed dependency did not surface a Vite diagnostic.");
    await expect(generateBunwireArtifacts({ root, compilerOptions: compilerOptions() })).rejects.toThrow();
    expect(await fs.readFile(clientPath, "utf8")).toBe(lastClient);
    await fs.writeFile(valuesB, 'export const ROUTE = "getD";\n');
    await waitFor(async () => (await server?.transformRequest("virtual:bunwire/client"))?.code.includes('"users/getD"') === true,
      "Restoring the deleted dependency did not recover the Vite client.");
    const after = await generateBunwireArtifacts({ root, compilerOptions: compilerOptions() });
    expect(after.dependencies).toContain(identity(path.join(shared, "values-b.ts")));
    expect(after.changedPaths).toEqual([]);
    const finalMtime = (await fs.stat(clientPath)).mtimeMs;
    await new Promise<void>((resolve) => setTimeout(resolve, 1_500));
    expect((await fs.stat(clientPath)).mtimeMs).toBe(finalMtime);
  }, 300_000);
});
