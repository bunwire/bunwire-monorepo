import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { ElectrobunAdapter } from "@bunwire/electrobun";
import { aggregateCompilerExtensions, analyzeBunwireProgram } from "@bunwire/vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = path.join(root, "tests/fixtures/milestone-20-policy");
const previous = path.join(root, "tests/fixtures/milestone-17-policy");
const paths = { "@bunwire/core": ["packages/core/src/index.ts"], "@bunwire/electrobun": ["packages/electrobun/src/index.ts"],
  "proof-static": ["tests/fixtures/milestone-16-static-metadata/adapter.ts"] };
const extensions = aggregateCompilerExtensions(ElectrobunAdapter.compiler);
const directories: string[] = [];
afterAll(async () => { for (const directory of directories) {
  if (path.dirname(directory) !== fixture || !path.basename(directory).startsWith(".generated-")) throw new Error("Unsafe cleanup target");
  await rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
} });
async function policy(body: string, prelude = "") {
  const directory = await mkdtemp(path.join(fixture, ".generated-")); directories.push(directory);
  const bootstrap = path.join(directory, "bootstrap.ts");
  await writeFile(bootstrap, `import { defineApp } from "@bunwire/core"; ${prelude}
    export default defineApp().withMiddlewares((registry) => { ${body} });`);
  return () => analyzeBunwireProgram({ projectRoot: root, bootstrapPath: bootstrap, sourceRoots: [previous], extensions,
    sourceFiles: [path.join(previous, "middleware.ts"), path.join(previous, "controllers/admin/panel.ts")],
    compilerOptions: { baseUrl: root, paths } });
}

describe("Milestone 20 — shared static loop budgets", () => {
  it("accepts exactly 10000 emitted declarations before canonical deduplication", async () => {
    const run = await policy(`for (const value of VALUES) { registry.use(value); }`,
      `const VALUES = [${Array(10_000).fill('"auth"').join(",")}];`);
    const panel = run().classes.find((entry) => entry.name === "Panel")!;
    expect(panel.methods[0]!.middleware[0]!.target.symbolName).toBe("Auth");
  });

  it("rejects declaration 10001 without returning a partial analysis", async () => {
    const run = await policy(`for (const value of VALUES) { registry.use(value); }`,
      `const VALUES = [${Array(10_001).fill('"auth"').join(",")}];`);
    expect(run).toThrow(/declaration budget \(10000\).*Policy loop path/s);
  });

  it("charges repeated empty-body expansion to the node budget independently of declarations", async () => {
    const body = Array.from({ length: 18 }, (_, index) => `for (const item${index} of [0, 1]) {`).join("\n") + "}".repeat(18);
    const run = await policy(body);
    expect(run).toThrow(/evaluated node budget \(100000\).*Policy loop path/s);
  });

  it("counts nested loops toward the shared depth budget", async () => {
    const body = Array.from({ length: 70 }, (_, index) => `for (const item${index} of [0]) {`).join("\n") + "}".repeat(70);
    const run = await policy(body);
    expect(run).toThrow(/depth budget \(64\).*Policy loop path/s);
  });
});
