import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { BunAdapter } from "@bunwire/bun";
import { defineApp, type RuntimeRegistry } from "@bunwire/core";
import { ElectrobunAdapter, ManualElectrobunAdapter, defineElectrobunContext } from "@bunwire/electrobun";
import { aggregateCompilerExtensions, analyzeBunwireProgram, generateRuntimeRegistryModule } from "@bunwire/vite";
import { PolicyAdapter, type Host } from "../fixtures/milestone-17-policy/adapter.js";
import { trace } from "../fixtures/milestone-17-policy/middleware.js";
import { BrowserView, BrowserWindow } from "../fixtures/milestone-11-electrobun/fake-native.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = path.join(root, "tests/fixtures/milestone-20-policy");
const previous = path.join(root, "tests/fixtures/milestone-17-policy");
const paths = { "@bunwire/core": ["packages/core/src/index.ts"], "@bunwire/bun": ["packages/bun/src/index.ts"],
  "@bunwire/electrobun": ["packages/electrobun/src/index.ts"], "proof-static": ["tests/fixtures/milestone-16-static-metadata/adapter.ts"] };
const electro = aggregateCompilerExtensions(ElectrobunAdapter.compiler);
const generic = aggregateCompilerExtensions(PolicyAdapter.compiler);
const bun = aggregateCompilerExtensions(BunAdapter.compiler);
const directories: string[] = [];
async function temporary() { const directory = await mkdtemp(path.join(fixture, ".generated-")); directories.push(directory); return directory; }
afterAll(async () => { for (const directory of directories) {
  if (path.dirname(directory) !== fixture || !path.basename(directory).startsWith(".generated-")) throw new Error("Unsafe cleanup target");
  await rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
} });
async function bootstrap(chain: string, prelude = "", imported = "") {
  const directory = await temporary(); const file = path.join(directory, "bootstrap.ts");
  if (imported) await writeFile(path.join(directory, "values.ts"), imported);
  await writeFile(file, `import { defineApp } from "@bunwire/core"; import { Report, Cleanup } from "../../milestone-17-policy/bun/src/jobs.js"; import { Auth, Audit } from "../../milestone-17-policy/middleware.js"; ${prelude}\nexport default ${chain};`);
  return { directory, file };
}
function middleware(file: string, extensions = electro) {
  return analyzeBunwireProgram({ projectRoot: root, bootstrapPath: file, sourceRoots: [previous], extensions,
    sourceFiles: [path.join(previous, "middleware.ts"), path.join(previous, extensions === generic ? "controllers/admin/fake.ts" : "controllers/admin/panel.ts")],
    compilerOptions: { baseUrl: root, paths } });
}
function schedule(file: string) {
  return analyzeBunwireProgram({ projectRoot: root, bootstrapPath: file, sourceRoots: [path.join(previous, "bun/src")], extensions: bun,
    sourceFiles: [path.join(previous, "bun/src/jobs.ts")], compilerOptions: { baseUrl: root, paths } });
}
function pipeline(file: string) {
  return middleware(file).classes.find((entry) => entry.name === "Panel")!.methods[0]!.middleware
    .map((entry) => entry.target.symbolName.toLowerCase() + (entry.parameters.length ? `:${entry.parameters.join(",")}` : ""));
}
const jobLoop = `defineApp().withSchedule((schedule) => {
  const jobs = [Report] as const;
  for (const job of jobs) {
    schedule.job(job, "daily", { limit: 6 }).dailyAt("04:30").timezone("UTC").id("reports.daily").withoutOverlapping();
  }
  schedule.task(Cleanup).hourlyAt(15).id("cleanup").lockFor(1000);
})`;

describe("Milestone 20 — bounded static policy loops", () => {
  it("compiles the shared job-array example with canonical targets and the intended schedule", async () => {
    const source = await bootstrap(jobLoop);
    expect(schedule(source.file).schedules).toMatchObject([
      { id: "reports.daily", execution: "job", arguments: ["daily", { limit: 6 }], cron: "30 4 * * *" },
      { id: "cleanup", execution: "direct", arguments: [], cron: "15 * * * *" },
    ]);
  });

  it("accepts empty and imported arrays without discovering unrelated classes", async () => {
    const source = await bootstrap(`defineApp().withMiddlewares((r) => {
      for (const value of [] as const) { r.use(value); }
      for (const value of IMPORTED) { r.use(value); }
    })`, 'import { IMPORTED } from "./values.js";', 'export const IMPORTED = ["auth", "audit:strict"] as const;');
    expect(pipeline(source.file)).toEqual(["auth", "audit:strict", "audit:controller", "audit:method"]);
  });

  it("expands nested loops in array order with isolated local constants and lexical shadowing", async () => {
    const source = await bootstrap(`defineApp().withMiddlewares((r) => {
      const value = "audit:strict";
      for (const values of [["auth", "csrf"], ["can:admin.access"]] as const) {
        for (const value of values) { const alias = value; r.use(alias); }
      }
      r.use(value);
    })`);
    expect(pipeline(source.file)).toEqual(["auth", "csrf", "can:admin.access", "audit:strict", "audit:controller", "audit:method"]);
  });

  it("supports helper calls inside loops and loops inside imported helpers", async () => {
    const source = await bootstrap(`defineApp().withMiddlewares((r) => {
      for (const value of ["csrf", "auth"] as const) { attach(r, value); }
      attachAll(r);
    })`, 'import { attach, attachAll } from "./values.js";', `import type { MiddlewarePolicyRegistry } from "@bunwire/core";
      export function attach(r: MiddlewarePolicyRegistry, value: string) { r.use(value); }
      export function attachAll(r: MiddlewarePolicyRegistry) { for (const value of ["audit:strict", "can:admin.access"] as const) { r.use(value); } }`);
    expect(pipeline(source.file)).toEqual(["csrf", "auth", "audit:strict", "can:admin.access", "audit:controller", "audit:method"]);
  });

  it("preserves canonical middleware class identity for loop-bound targets", async () => {
    const source = await bootstrap(`defineApp().withMiddlewares((r) => {
      for (const middleware of [Auth, Audit] as const) { r.use(middleware); }
    })`);
    expect(pipeline(source.file)).toEqual(["auth", "audit", "audit:controller", "audit:method"]);
    const targets = middleware(source.file).classes.find((entry) => entry.name === "Panel")!.methods[0]!.middleware;
    expect(targets[0]!.target.symbolName).toBe("Auth");
    expect(targets[1]!.target.symbolName).toBe("Audit");
  });

  it("rejects arbitrary classes as loop-bound middleware and job targets", async () => {
    const badMiddleware = await bootstrap(`defineApp().withMiddlewares((r) => {
      for (const target of [Plain]) { r.use(target); }
    })`, 'class Plain {}');
    expect(() => middleware(badMiddleware.file)).toThrow(/middleware|canonical|managed/i);
    const badJob = await bootstrap(`defineApp().withSchedule((s) => {
      for (const target of [Plain]) { s.job(target).dailyAt("04:00"); }
    })`, 'class Plain { handle() {} }');
    expect(() => schedule(badJob.file)).toThrow(/allowed canonical kind/);
  });

  it.each([
    ['mutable binding', 'for (let value of ["auth"]) { r.use(value); }', /for \(const item of knownArray\)/],
    ['destructured binding', 'for (const [value] of [["auth"]]) { r.use(value); }', /one identifier/],
    ['missing body block', 'for (const value of ["auth"]) r.use(value);', /block body/],
    ['for await', 'for await (const value of ["auth"]) { r.use(value); }', /synchronous/],
    ['general for', 'for (let i = 0; i < 1; i++) { r.use("auth"); }', /Only bounded/],
    ['for in', 'for (const value in ["auth"]) { r.use(value); }', /Only bounded/],
    ['while', 'while (true) { r.use("auth"); }', /Only bounded/],
    ['conditional', 'if (true) r.use("auth");', /Conditional control flow/],
    ['break', 'for (const value of ["auth"]) { break; }', /break and continue/],
    ['continue', 'for (const value of ["auth"]) { continue; }', /break and continue/],
    ['assignment', 'for (const value of ["auth"]) { value = "csrf"; r.use(value); }', /direct non-optional calls/],
    ['runtime iterable', 'for (const value of fetchValues()) { r.use(value); }', /arbitrary calls/],
    ['non-array', 'for (const value of "auth") { r.use(value); }', /known array/],
  ] as const)("rejects unsupported loop form: %s", async (_label, body, message) => {
    const source = await bootstrap(`defineApp().withMiddlewares((r) => { ${body} })`);
    expect(() => middleware(source.file)).toThrow(message);
  });

  it("rejects mutation of a consumed imported loop iterable", async () => {
    const source = await bootstrap(`defineApp().withMiddlewares((r) => {
      for (const value of IMPORTED) { r.use(value); }
    })`, 'import { IMPORTED } from "./values.js";', 'export const IMPORTED = ["auth"]; IMPORTED.push("csrf");');
    expect(() => middleware(source.file)).toThrow(/mutat|write|escape/i);
  });

  it("rejects recursive helper calls reached through a loop with the loop path", async () => {
    const source = await bootstrap(`defineApp().withMiddlewares((r) => { visit(r); })`, `
      function visit(r: import("@bunwire/core").MiddlewarePolicyRegistry) {
        for (const value of ["auth"]) { visit(r); }
      }`);
    expect(() => middleware(source.file)).toThrow(/Recursive policy helper call.*Policy loop path/s);
  });

  it("matches equivalent inline middleware and schedule output byte for byte", async () => {
    const loop = await bootstrap(`defineApp().withMiddlewares((r) => {
      for (const value of ["auth", "audit:strict"]) { r.use(value); }
    })`);
    const inline = await bootstrap(`defineApp().withMiddlewares((r) => { r.use("auth"); r.use("audit:strict"); })`);
    const output = path.join(fixture, "registry.ts");
    const a = generateRuntimeRegistryModule({ analysis: middleware(loop.file), extensions: electro, modulePath: output });
    const b = generateRuntimeRegistryModule({ analysis: middleware(inline.file), extensions: electro, modulePath: output });
    expect(a.code).toBe(b.code); expect(a.hash).toBe(b.hash);
    const loopJob = await bootstrap(jobLoop);
    const inlineJob = await bootstrap(`defineApp().withSchedule((s) => {
      s.job(Report, "daily", { limit: 6 }).dailyAt("04:30").timezone("UTC").id("reports.daily").withoutOverlapping();
      s.task(Cleanup).hourlyAt(15).id("cleanup").lockFor(1000);
    })`);
    const c = generateRuntimeRegistryModule({ analysis: schedule(loopJob.file), extensions: bun, modulePath: output });
    const d = generateRuntimeRegistryModule({ analysis: schedule(inlineJob.file), extensions: bun, modulePath: output });
    expect(c.code).toBe(d.code); expect(c.hash).toBe(d.hash);
  });

  it("preserves deduplication and rejects repeated group names and schedule IDs", async () => {
    const dedup = await bootstrap(`defineApp().withMiddlewares((r) => {
      for (const value of ["auth", "auth"]) { r.use(value); }
    })`);
    expect(pipeline(dedup.file)).toEqual(["auth", "audit:controller", "audit:method"]);
    const groups = await bootstrap(`defineApp().withMiddlewares((r) => {
      for (const name of ["web", "web"]) { r.group(name, ["auth"]); }
    })`);
    expect(() => middleware(groups.file)).toThrow(/declared more than once/);
    const schedules = await bootstrap(`defineApp().withSchedule((s) => {
      for (const id of ["same", "same"]) { s.job(Report, "daily", { limit: 6 }).dailyAt("04:00").id(id); }
    })`);
    expect(() => schedule(schedules.file)).toThrow(/Duplicate generated schedule identity/);
  });

  it.each(["electrobun", "generic"])("executes loop-derived middleware through %s", async (adapter) => {
    const source = await bootstrap(`defineApp().withMiddlewares((r) => {
      for (const value of ["auth", "audit:strict"]) { r.use(value); }
    })`);
    const extensions = adapter === "generic" ? generic : electro;
    const output = path.join(source.directory, "registry.ts");
    await writeFile(output, generateRuntimeRegistryModule({ analysis: middleware(source.file, extensions), extensions, modulePath: output }).code);
    const { applicationRegistry } = await import(pathToFileURL(output).href) as { applicationRegistry: RuntimeRegistry };
    trace.length = 0;
    if (adapter === "generic") {
      const context: Host = {}; const app = defineApp().withAdapter(new PolicyAdapter()).withContext(context).withRuntimeRegistry(applicationRegistry);
      await app.start(); try { await expect(context.invoke!()).resolves.toBe("admin"); } finally { await app.stop(); }
    } else {
      const rpc = BrowserView.defineRPC({ handlers: { requests: {}, messages: {} } });
      const window = new BrowserWindow({ title: "Static Loops", rpc });
      const app = defineApp().withAdapter(new ManualElectrobunAdapter()).withContext(defineElectrobunContext(window)).withRuntimeRegistry(applicationRegistry);
      await app.start(); try { await expect(rpc.receiveRequest("admin/run", { args: [] })).resolves.toBe("admin"); } finally { await app.stop(); }
    }
    const labels = ["auth", "audit:strict", "audit:controller", "audit:method"];
    expect(trace).toEqual([...labels.map((label) => `before:${label}`), "handler", ...[...labels].reverse().map((label) => `after:${label}`)]);
  });

  it("runs a loop-derived job through a generated registry in a real Bun process", async () => {
    const source = await bootstrap(jobLoop); const output = path.join(source.directory, "registry.ts");
    await writeFile(output, generateRuntimeRegistryModule({ analysis: schedule(source.file), extensions: bun, modulePath: output }).code);
    const result = await new Promise<string>((resolve, reject) => {
      const child = spawn("bun", [path.join(root, "tests/milestone-17/fixtures/scheduler-child.ts"), output], { cwd: root, stdio: "pipe" });
      let text = ""; const timeout = setTimeout(() => { child.kill(); reject(new Error(`Scheduler child timeout: ${text}`)); }, 20000);
      child.stdout.on("data", (chunk) => { text += chunk.toString(); }); child.stderr.on("data", (chunk) => { text += chunk.toString(); });
      child.on("error", (error) => { clearTimeout(timeout); reject(error); });
      child.on("exit", (code) => { clearTimeout(timeout); code === 0 ? resolve(text) : reject(new Error(text)); });
    });
    expect(result).toContain("COMPOSED_SCHEDULE_OK");
  });

  it("does not run bootstrap or imported helper side effects while expanding loops", async () => {
    const source = await bootstrap(`defineApp().withMiddlewares((r) => { attach(r); })`, 'import { attach } from "./values.js";',
      `import { writeFileSync } from "node:fs"; import type { MiddlewarePolicyRegistry } from "@bunwire/core";
       writeFileSync("SENTINEL", "ran"); export function attach(r: MiddlewarePolicyRegistry) { for (const value of ["auth"]) { r.use(value); } }`);
    const marker = path.join(source.directory, "executed.txt");
    await writeFile(path.join(source.directory, "values.ts"), (await readFile(path.join(source.directory, "values.ts"), "utf8")).replace("SENTINEL", marker.replaceAll("\\", "/")));
    expect(existsSync(marker)).toBe(false);
    expect(pipeline(source.file)[0]).toBe("auth");
    expect(existsSync(marker)).toBe(false);
  });
});
