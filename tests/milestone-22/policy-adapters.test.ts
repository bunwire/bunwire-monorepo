import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { defineApp, type RuntimeRegistry } from "@bunwire/core";
import { ElectrobunAdapter, ManualElectrobunAdapter, defineElectrobunContext } from "@bunwire/electrobun";
import { aggregateCompilerExtensions, analyzeBunwireProgram, generateRuntimeRegistryModule, generateCallerContractModule } from "@bunwire/vite";
import { PolicyAdapter, type Host } from "../fixtures/milestone-17-policy/adapter.js";
import { BrowserView, BrowserWindow } from "../fixtures/milestone-11-electrobun/fake-native.js";
import { trace } from "../fixtures/milestone-22-billing/middleware.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = path.join(root, "tests/fixtures/milestone-22-billing");
const paths = { "@bunwire/core": ["packages/core/src/index.ts"], "@bunwire/bun": ["packages/bun/src/index.ts"],
  "@bunwire/electrobun": ["packages/electrobun/src/index.ts"], "proof-static": ["tests/fixtures/milestone-16-static-metadata/adapter.ts"] };
const electro = aggregateCompilerExtensions(ElectrobunAdapter.compiler);
const generic = aggregateCompilerExtensions(PolicyAdapter.compiler);
const directories: string[] = [];
function analyze(kind: "electro" | "generic", bootstrapPath = path.join(fixture, "bootstrap-policy.ts")) {
  return analyzeBunwireProgram({ projectRoot: root, bootstrapPath, sourceRoots: [fixture],
    sourceFiles: [path.join(fixture, "middleware.ts"), path.join(fixture, `controllers/admin/${kind}.ts`)],
    extensions: kind === "electro" ? electro : generic, compilerOptions: { baseUrl: root, paths } });
}
async function temporary() { const directory = await mkdtemp(path.join(fixture, ".generated-")); directories.push(directory); return directory; }
afterAll(async () => { for (const directory of directories) {
  if (path.dirname(directory) !== fixture || !path.basename(directory).startsWith(".generated-")) throw new Error("Unsafe cleanup target");
  await rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
} });
const labels = ["billing-auth", "billing-audit:global", "billing-audit:strict", "billing-can:admin.access", "billing-audit:controller", "billing-audit:method"];
const expected = [...labels.map((label) => `before:${label}`), "handler", ...[...labels].reverse().map((label) => `after:${label}`)];

describe("Milestone 22 — composed policy adapter ownership", () => {
  it.each(["electro", "generic"] as const)("executes the imported helper and computed mapping through %s", async (kind) => {
    const directory = await temporary(); const file = path.join(directory, "registry.ts");
    const extensions = kind === "electro" ? electro : generic;
    const analysis = analyze(kind);
    const generated = generateRuntimeRegistryModule({ analysis, extensions, modulePath: file });
    await writeFile(file, generated.code);
    const { applicationRegistry } = await import(pathToFileURL(file).href) as { applicationRegistry: RuntimeRegistry };
    trace.length = 0;
    if (kind === "generic") {
      const context: Host = {};
      const app = defineApp().withAdapter(new PolicyAdapter()).withContext(context).withRuntimeRegistry(applicationRegistry);
      await app.start(); try { await expect(context.invoke!()).resolves.toBe("admin"); } finally { await app.stop(); }
    } else {
      const rpc = BrowserView.defineRPC({ handlers: { requests: {}, messages: {} } });
      const window = new BrowserWindow({ title: "Billing", rpc });
      const app = defineApp().withAdapter(new ManualElectrobunAdapter()).withContext(defineElectrobunContext(window)).withRuntimeRegistry(applicationRegistry);
      await app.start(); try { await expect(rpc.receiveRequest("admin/run", { args: [] })).resolves.toBe("admin"); } finally { await app.stop(); }
      const client = generateCallerContractModule({ analysis, extensions, modulePath: path.join(directory, "client.ts") }).code;
      expect(client).toContain('"admin/run"');
    }
    expect(trace).toEqual(expected);
  });

  it.each(["electro", "generic"] as const)("emits identical registry code and hash for inline %s policy", async (kind) => {
    const directory = await temporary(); const file = path.join(directory, "registry.ts");
    const extensions = kind === "electro" ? electro : generic;
    const composed = generateRuntimeRegistryModule({ analysis: analyze(kind), extensions, modulePath: file });
    const inline = path.join(directory, "inline.ts");
    await writeFile(inline, `import { defineApp } from "@bunwire/core";\n`
      + `import { BillingAuth } from "../middleware.js";\n`
      + `export default defineApp().withMiddlewares((r) => { r.use(BillingAuth, "billing-audit:global"); })`
      + `.withMiddlewares((r) => { r.group("admin", ["billing-audit:strict", "billing-can:admin.access"]);`
      + ` r.controllers({ "controllers/admin/**": "admin" }); });\n`);
    const direct = generateRuntimeRegistryModule({ analysis: analyze(kind, inline), extensions, modulePath: file });
    expect(direct.code).toBe(composed.code);
    expect(direct.hash).toBe(composed.hash);
  });
});
