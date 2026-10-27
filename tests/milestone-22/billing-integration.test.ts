import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { BunAdapter } from "@bunwire/bun";
import { aggregateCompilerExtensions, analyzeBunwireProgram, generateRuntimeRegistryModule, generateCallerContractModule } from "@bunwire/vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = path.join(root, "tests/fixtures/milestone-22-billing");
const middleware = path.join(fixture, "middleware.ts");
const extensions = aggregateCompilerExtensions(BunAdapter.compiler);
const paths = { "@bunwire/core": ["packages/core/src/index.ts"], "@bunwire/bun": ["packages/bun/src/index.ts"] };
const directories: string[] = [];
function analyze(bootstrapPath = path.join(fixture, "bootstrap.ts")) {
  return analyzeBunwireProgram({ projectRoot: root, bootstrapPath, sourceRoots: [fixture, path.dirname(middleware)], extensions,
    sourceFiles: [path.join(fixture, "jobs.ts"), path.join(fixture, "controllers/admin/panel.ts"), middleware],
    compilerOptions: { baseUrl: root, paths } });
}
afterAll(async () => { for (const directory of directories) {
  if (path.dirname(directory) !== fixture || !path.basename(directory).startsWith(".generated-")) throw new Error("Unsafe cleanup target");
  await rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
} });

describe("Milestone 22 — integrated billing composition", () => {
  it("compiles imported policy, middleware, helpers, blocks, and bounded job iteration", () => {
    const result = analyze();
    expect(result.classes.find((entry) => entry.name === "Charge")?.data).toMatchObject({
      id: "billing.charge", queue: "critical-billing", timeout: 60_000, backoff: [1_000, 5_000, 30_000] });
    expect(result.schedules).toMatchObject([{ id: "billing.daily", execution: "job", arguments: ["scheduled", { limit: 6 }], cron: "30 4 * * *" }]);
    expect(result.classes.find((entry) => entry.name === "Panel")?.methods[0]?.middleware.map((item) => item.target.symbolName.toLowerCase()
      + (item.parameters.length ? `:${item.parameters.join(",")}` : ""))).toEqual([
      "billingauth", "billingaudit:global", "billingaudit:strict", "billingcan:admin.access", "billingaudit:controller", "billingaudit:method"]);
    const client = generateCallerContractModule({ analysis: result, extensions, modulePath: path.join(fixture, "client.ts") }).code;
    expect(client).not.toContain("billing.charge");
    expect(client).toContain("BunwireRequestContract");
  });

  it("keeps generated imports, records, and hash byte-identical across repeated analyses", () => {
    const modulePath = path.join(fixture, "same-registry.ts");
    const first = generateRuntimeRegistryModule({ analysis: analyze(), extensions, modulePath });
    const second = generateRuntimeRegistryModule({ analysis: analyze(), extensions, modulePath });
    expect(second.code).toBe(first.code);
    expect(second.hash).toBe(first.hash);
    expect(first.code).toContain("billing.daily");
    expect(first.code).toContain("billing.charge");
  });

  it("executes generated scheduling, queue policy, DI, and middleware in a real Bun process", async () => {
    const directory = await mkdtemp(path.join(fixture, ".generated-")); directories.push(directory);
    const file = path.join(directory, "registry.ts");
    const generated = generateRuntimeRegistryModule({ analysis: analyze(), extensions, modulePath: file });
    await writeFile(file, generated.code);
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn("bun", [path.join(root, "tests/milestone-22/fixtures/billing-child.ts"), file], { cwd: root, stdio: "pipe" });
      let output = ""; const timer = setTimeout(() => { child.kill(); reject(new Error(`Billing child timeout: ${output}`)); }, 25_000);
      child.stdout.on("data", (data) => { output += data.toString(); }); child.stderr.on("data", (data) => { output += data.toString(); });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("exit", (code) => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error(output)); });
    });
    expect(output).toContain("BILLING_MILESTONE_22_OK");
  }, 40_000);
});
