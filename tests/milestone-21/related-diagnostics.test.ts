import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { ElectrobunAdapter } from "@bunwire/electrobun";
import { BunAdapter } from "@bunwire/bun";
import { aggregateCompilerExtensions, analyzeBunwireProgram, BunwireCompilerError } from "@bunwire/vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = path.join(root, "tests/fixtures/milestone-21-diagnostics");
const previous = path.join(root, "tests/fixtures/milestone-17-policy");
const extensions = aggregateCompilerExtensions(ElectrobunAdapter.compiler);
const directories: string[] = [];
const paths = { "@bunwire/core": ["packages/core/src/index.ts"],
  "@bunwire/electrobun": ["packages/electrobun/src/index.ts"],
  "proof-static": ["tests/fixtures/milestone-16-static-metadata/adapter.ts"] };

async function source(body: string, imported: string, extra = "") {
  const directory = await mkdtemp(path.join(fixture, ".generated with spaces-"));
  directories.push(directory);
  await writeFile(path.join(directory, "values.ts"), imported);
  if (extra) await writeFile(path.join(directory, "helper.ts"), extra);
  const bootstrap = path.join(directory, "bootstrap.ts");
  await writeFile(bootstrap, `import { defineApp } from "@bunwire/core"; import { VALUES } from "./values.js";
    ${extra ? 'import { attach } from "./helper.js";' : ""}
    export default defineApp().withMiddlewares((r) => { ${body} });`);
  return { directory, run: () => analyzeBunwireProgram({ projectRoot: root, bootstrapPath: bootstrap,
    sourceRoots: [previous], extensions,
    sourceFiles: [path.join(previous, "middleware.ts"), path.join(previous, "controllers/admin/panel.ts")],
    compilerOptions: { baseUrl: root, paths } }) };
}

afterAll(async () => { for (const directory of directories) {
  if (path.dirname(directory) !== fixture || !path.basename(directory).startsWith(".generated with spaces-"))
    throw new Error("Unsafe test cleanup target");
  await rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
} });

describe("Milestone 21 — structured related compiler locations", () => {
  it("links an imported expression failure to its reference without changing the primary location", async () => {
    const entry = await source('r.use(VALUES);', 'export const VALUES = [makeValue()];');
    let error: unknown;
    try { entry.run(); } catch (cause) { error = cause; }
    expect(error).toBeInstanceOf(BunwireCompilerError);
    const diagnostic = error as BunwireCompilerError;
    expect(diagnostic.code).toBe("MIDDLEWARE_POLICY_INVALID");
    expect(diagnostic.location?.filePath).toBe(path.join(entry.directory, "values.ts"));
    expect(diagnostic.related.some((related) => related.location.filePath === path.join(entry.directory, "bootstrap.ts"))).toBe(true);
    expect(diagnostic.related.some((related) => related.label === "Static declaration"
      && related.location.filePath === path.join(entry.directory, "values.ts"))).toBe(true);
    expect(diagnostic.message).toContain("Resolution path:");
  });

  it("links a nested helper error to its definitions and call sites", async () => {
    const entry = await source('attach(r, VALUES);', 'export const VALUES = ["auth"];', `
      import type { MiddlewarePolicyRegistry } from "@bunwire/core";
      export function attach(r: MiddlewarePolicyRegistry, values: readonly string[]) { inner(r, values); }
      function inner(r: MiddlewarePolicyRegistry, values: readonly string[]) { return r.use(values); }
    `);
    let error: unknown;
    try { entry.run(); } catch (cause) { error = cause; }
    expect(error).toBeInstanceOf(BunwireCompilerError);
    const diagnostic = error as BunwireCompilerError;
    expect(diagnostic.code).toBe("MIDDLEWARE_POLICY_INVALID");
    expect(diagnostic.location?.filePath).toBe(path.join(entry.directory, "helper.ts"));
    expect(diagnostic.related.map((related) => related.label)).toContain("Policy helper definition");
    expect(diagnostic.related.some((related) => related.location.filePath === path.join(entry.directory, "bootstrap.ts"))).toBe(true);
  });

  it("links delayed loop policy validation to the reached iteration and helper", async () => {
    const entry = await source('attach(r, VALUES);', 'export const VALUES = ["unknown-alias"];', `
      import type { MiddlewarePolicyRegistry } from "@bunwire/core";
      export function attach(r: MiddlewarePolicyRegistry, values: readonly string[]) {
        for (const value of values) { r.use(value); }
      }
    `);
    let error: unknown;
    try { entry.run(); } catch (cause) { error = cause; }
    expect(error).toBeInstanceOf(BunwireCompilerError);
    const diagnostic = error as BunwireCompilerError;
    expect(diagnostic.code).toBe("MIDDLEWARE_POLICY_INVALID");
    expect(diagnostic.message).toContain("Policy loop path:");
    expect(diagnostic.related.some((related) => related.label === "Policy loop iteration 0"
      && related.location.filePath === path.join(entry.directory, "helper.ts"))).toBe(true);
    expect(diagnostic.related.some((related) => related.label === "Policy helper call"
      && related.location.filePath === path.join(entry.directory, "bootstrap.ts"))).toBe(true);
  });

  it("keeps loop context on a delayed schedule target error", async () => {
    const directory = await mkdtemp(path.join(fixture, ".generated with spaces-"));
    directories.push(directory);
    const bootstrap = path.join(directory, "bootstrap.ts");
    await writeFile(bootstrap, `import { defineApp } from "@bunwire/core";
      class Plain {}
      export default defineApp().withSchedule((s) => {
        for (const target of [Plain]) { s.task(target).dailyAt("04:00"); }
      });`);
    let error: unknown;
    try { analyzeBunwireProgram({ projectRoot: root, bootstrapPath: bootstrap,
      sourceRoots: [path.join(previous, "bun/src")], extensions: aggregateCompilerExtensions(BunAdapter.compiler),
      sourceFiles: [path.join(previous, "bun/src/jobs.ts")], compilerOptions: { baseUrl: root,
        paths: { ...paths, "@bunwire/bun": ["packages/bun/src/index.ts"] } } }); }
    catch (cause) { error = cause; }
    expect(error).toBeInstanceOf(BunwireCompilerError);
    const diagnostic = error as BunwireCompilerError;
    expect(diagnostic.code).toBe("SCHEDULE_POLICY_INVALID");
    expect(diagnostic.message).toContain("Policy loop path:");
    expect(diagnostic.related.some((related) => related.label === "Policy loop iteration 0"
      && related.location.filePath === bootstrap)).toBe(true);
  });
});
