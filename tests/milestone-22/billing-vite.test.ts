import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { analyzeBunwireApplication, bunwire, generateBunwireArtifacts } from "@bunwire/vite";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = path.join(repositoryRoot, "tests/fixtures/milestone-22-billing");
function options(): ts.CompilerOptions {
  return { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, experimentalDecorators: true,
    strict: true, noEmit: true, skipLibCheck: true, baseUrl: repositoryRoot,
    paths: { "@bunwire/core": ["packages/core/src/index.ts"], "@bunwire/bun": ["packages/bun/src/index.ts"] } };
}
async function waitFor(check: () => Promise<boolean>, message: string, timeout = 90_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (await check()) return; } catch { /* Watcher may still be analyzing the edit. */ }
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(message);
}

describe.sequential("Milestone 22 — integrated billing Vite regeneration", () => {
  let root: string;
  let server: ViteDevServer | undefined;
  let values: string;
  let helper: string;
  let registry: string;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(repositoryRoot, ".tmp-bunwire-m22-"));
    await fs.cp(source, path.join(root, "src"), { recursive: true });
    await fs.rm(path.join(root, "src/controllers/admin/electro.ts"));
    await fs.rm(path.join(root, "src/controllers/admin/generic.ts"));
    await fs.mkdir(path.join(root, "shared"));
    const originalValues = path.join(root, "src/values.ts");
    await fs.writeFile(path.join(root, "shared/values.ts"),
      (await fs.readFile(originalValues, "utf8")).replace('"./middleware.js"', '"../src/middleware.js"'));
    await fs.rm(originalValues);
    const barrel = path.join(root, "src/barrel.ts");
    await fs.writeFile(barrel, (await fs.readFile(barrel, "utf8")).replace('"./values.js"', '"../shared/values.js"'));
    const copiedHelper = path.join(root, "src/helpers.ts");
    await fs.writeFile(copiedHelper,
      (await fs.readFile(copiedHelper, "utf8")).replace('"./values.js"', '"../shared/values.js"'));
    const bootstrap = path.join(root, "src/bootstrap.ts");
    await fs.writeFile(bootstrap, 'import { BunAdapter } from "@bunwire/bun";\n'
      + (await fs.readFile(bootstrap, "utf8")).replace("export default defineApp()", 
        'export default defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false }))'));
    await fs.writeFile(path.join(root, "bunwire.config.ts"),
      'import { defineBunwireConfig } from "@bunwire/vite"; export default defineBunwireConfig({ source: "./src", bootstrap: "./src/bootstrap.ts" });\n');
    await fs.writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { experimentalDecorators: true } }));
    values = path.join(root, "shared/values.ts");
    helper = path.join(root, "src/helpers.ts");
    registry = path.join(root, ".bunwire/registry.ts");
  });
  afterAll(async () => {
    await server?.close();
    if (path.dirname(root) !== repositoryRoot || !path.basename(root).startsWith(".tmp-bunwire-m22-"))
      throw new Error("Unsafe test cleanup target");
    await fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  });

  it("updates re-exported constants and helper output, preserves unchanged bytes, and recovers from invalid/deleted sources", async () => {
    const initial = await generateBunwireArtifacts({ root, compilerOptions: options() });
    expect(initial.dependencies.some((file) => file.endsWith("barrel.ts"))).toBe(true);
    expect(initial.dependencies.some((file) => file.toLowerCase() === values.replaceAll("\\", "/").toLowerCase())).toBe(true);
    expect(await fs.readFile(registry, "utf8")).toContain("critical-billing");
    const stableTime = (await fs.stat(registry)).mtimeMs;
    const unchanged = await generateBunwireArtifacts({ root, compilerOptions: options() });
    expect(unchanged.changedPaths).toEqual([]);
    expect((await fs.stat(registry)).mtimeMs).toBe(stableTime);

    server = await createServer({ root, configFile: false, appType: "custom",
      resolve: { alias: { "@bunwire/core": path.join(repositoryRoot, "packages/core/src/index.ts"),
        "@bunwire/bun": path.join(repositoryRoot, "packages/bun/src/index.ts") } },
      plugins: [bunwire({ root, compilerOptions: options() })], server: { middlewareMode: true } });
    expect((await server.transformRequest("virtual:bunwire/registry"))?.code).toContain("critical-billing");

    await fs.writeFile(values, (await fs.readFile(values, "utf8")).replace('"critical-" + "billing"', '"priority-" + "billing"'));
    await waitFor(async () => (await server?.transformRequest("virtual:bunwire/registry"))?.code.includes("priority-billing") === true,
      "Re-exported queue constant did not invalidate the Vite registry");
    await fs.writeFile(helper, (await fs.readFile(helper, "utf8")).replace('"billing-can:admin.access"', '"billing-can:billing.access"'));
    await waitFor(async () => (await fs.readFile(registry, "utf8")).includes("billing.access"),
      "Imported helper edit did not regenerate middleware");

    const validValues = await fs.readFile(values, "utf8");
    const beforeDeletion = await fs.readFile(registry, "utf8");
    const websocket = vi.spyOn(server.ws, "send");
    const unlinks: string[] = [];
    server.watcher.on("unlink", (filePath) => { unlinks.push(filePath); });
    await fs.unlink(values);
    await waitFor(async () => unlinks.some((filePath) => path.resolve(filePath).toLowerCase() === values.toLowerCase()),
      "Vite did not observe the deleted dependency");
    await expect(generateBunwireArtifacts({ root, compilerOptions: options() })).rejects.toThrow();
    await waitFor(async () => websocket.mock.calls.some(([message]) => {
      const event = message as unknown as { type?: string; err?: { message?: string } };
      return event?.type === "error"
        && /ambient|type-only|values|import|module|source/i.test(event.err?.message ?? "");
    }),
    "Deleted re-export dependency did not produce a Vite diagnostic");
    expect(await fs.readFile(registry, "utf8")).toBe(beforeDeletion);
    await fs.writeFile(values, validValues);
    await waitFor(async () => (await server?.transformRequest("virtual:bunwire/registry"))?.code.includes("priority-billing") === true,
      "Vite did not recover after restoring the dependency");
    expect((await generateBunwireArtifacts({ root, compilerOptions: options() })).changedPaths).toEqual([]);

    await fs.writeFile(values, validValues.replace("30 * 2_000", "0"));
    await expect(generateBunwireArtifacts({ root, compilerOptions: options() })).rejects.toThrow(/timeout|safe integer|positive/i);
    await waitFor(async () => {
      try { await server?.transformRequest("virtual:bunwire/registry"); return false; }
      catch (error) { return error instanceof Error && /timeout|safe integer|positive/i.test(error.message); }
    }, "Invalid imported timeout did not produce a Vite diagnostic");
    await fs.writeFile(values, validValues);
    await waitFor(async () => {
      try {
        await server?.transformRequest("virtual:bunwire/registry");
        return (await generateBunwireArtifacts({ root, compilerOptions: options() })).changedPaths.length === 0;
      } catch { return false; }
    }, "Vite did not recover after fixing the invalid timeout");

    const validHelper = await fs.readFile(helper, "utf8");
    const recursiveErrorStart = websocket.mock.calls.length;
    await fs.writeFile(helper, validHelper.replace('registry.group("admin"',
      'registerSecurity(registry); registry.group("admin"'));
    await expect(generateBunwireArtifacts({ root, compilerOptions: options() })).rejects.toThrow(/Recursive policy helper call/i);
    await waitFor(async () => websocket.mock.calls.slice(recursiveErrorStart).some(([message]) => {
      const event = message as unknown as { type?: string; err?: { message?: string } };
      return event?.type === "error" && /Recursive policy helper call/i.test(event.err?.message ?? "");
    }), "Recursive imported helper did not produce a Vite diagnostic");
    await fs.writeFile(helper, validHelper);
    await waitFor(async () => {
      try { return (await generateBunwireArtifacts({ root, compilerOptions: options() })).changedPaths.length === 0; }
      catch { return false; }
    }, "Vite did not recover after fixing the recursive helper");

    const expansionErrorStart = websocket.mock.calls.length;
    const repeated = Array(10_001).fill('"billing-auth"').join(",");
    await fs.writeFile(helper, validHelper.replace('registry.group("admin"',
      `for (const value of [${repeated}]) { registry.use(value); } registry.group("admin"`));
    await expect(generateBunwireArtifacts({ root, compilerOptions: options() })).rejects.toThrow(/declaration budget \(10000\)/i);
    await waitFor(async () => websocket.mock.calls.slice(expansionErrorStart).some(([message]) => {
      const event = message as unknown as { type?: string; err?: { message?: string } };
      return event?.type === "error" && /declaration budget \(10000\)/i.test(event.err?.message ?? "");
    }), "Excessive imported helper expansion did not produce a Vite diagnostic");
    await fs.writeFile(helper, validHelper);
    await waitFor(async () => {
      try { return (await generateBunwireArtifacts({ root, compilerOptions: options() })).changedPaths.length === 0; }
      catch { return false; }
    }, "Vite did not recover after fixing excessive expansion");
  }, 300_000);

  it("recovers when a newly imported helper outside source roots is created", async () => {
    await server?.close();
    server = await createServer({ root, configFile: false, appType: "custom",
      resolve: { alias: { "@bunwire/core": path.join(repositoryRoot, "packages/core/src/index.ts"),
        "@bunwire/bun": path.join(repositoryRoot, "packages/bun/src/index.ts") } },
      plugins: [bunwire({ root, compilerOptions: options() })], server: { middlewareMode: true } });
    expect((await server.transformRequest("virtual:bunwire/registry"))?.code).toContain("billing.daily");

    const bootstrap = path.join(root, "src/bootstrap.ts");
    const original = await fs.readFile(bootstrap, "utf8");
    const before = await fs.readFile(registry, "utf8");
    const added = path.join(root, "shared/new-policy.ts");
    const websocket = vi.spyOn(server.ws, "send");
    await fs.writeFile(bootstrap, 'import { registerLate } from "../shared/new-policy.js";\n'
      + original.replace("registerSecurity(registry);", "registerSecurity(registry); registerLate(registry);"));
    await waitFor(async () => websocket.mock.calls.some(([message]) => {
      const event = message as unknown as { type?: string; err?: { message?: string } };
      return event?.type === "error" && /new-policy|helper|module|source/i.test(event.err?.message ?? "");
    }), "Missing new helper did not produce a Vite diagnostic", 20_000);
    await expect(generateBunwireArtifacts({ root, compilerOptions: options() })).rejects.toThrow();
    expect(await fs.readFile(registry, "utf8")).toBe(before);

    await fs.writeFile(added, [
      'import { Service, type MiddlewarePolicyRegistry } from "@bunwire/core";',
      '@Service() export class UnmanagedHelperClass {}',
      'export function registerLate(registry: MiddlewarePolicyRegistry) { registry.use("billing-audit:late"); }',
    ].join("\n"));
    await waitFor(async () => (await fs.readFile(registry, "utf8")).includes('["late"]'),
      "Creating a new helper did not recover Vite without another source edit", 20_000);
    expect((await server.transformRequest("virtual:bunwire/registry"))?.code).toContain('["late"]');
    const recovered = await analyzeBunwireApplication({ root, compilerOptions: options() });
    expect(recovered.analysis.dependencies.some((file) => file.endsWith("new-policy.ts"))).toBe(true);
    expect(recovered.sourceFiles).not.toContain(added);
    expect(recovered.analysis.classes.map((entry) => entry.name)).not.toContain("UnmanagedHelperClass");
    expect((await generateBunwireArtifacts({ root, compilerOptions: options() })).changedPaths).toEqual([]);
  }, 90_000);
});
