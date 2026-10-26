import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { BunAdapter } from "@bunwire/bun";
import { ApplicationStateError, defineApp, type RuntimeRegistry } from "@bunwire/core";
import { ElectrobunAdapter, ManualElectrobunAdapter, defineElectrobunContext } from "@bunwire/electrobun";
import { aggregateCompilerExtensions, analyzeBunwireProgram, generateRuntimeRegistryModule } from "@bunwire/vite";
import { PolicyAdapter, type Host } from "../fixtures/milestone-17-policy/adapter.js";
import { trace } from "../fixtures/milestone-17-policy/middleware.js";
import { BrowserView, BrowserWindow } from "../fixtures/milestone-11-electrobun/fake-native.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = path.join(root, "tests/fixtures/milestone-19-policy");
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
async function bootstrap(chain: string, imports = "") {
  const directory = await temporary(); const file = path.join(directory, "bootstrap.ts");
  await writeFile(file, `import { defineApp } from "@bunwire/core"; import { Report, Cleanup } from "../../milestone-17-policy/bun/src/jobs.js"; import { Auth, Audit } from "../../milestone-17-policy/middleware.js"; ${imports}\nexport default ${chain};`);
  return { directory, file };
}
function middleware(file: string, extensions = electro) {
  return analyzeBunwireProgram({ projectRoot: root, bootstrapPath: file, sourceRoots: [previous], extensions,
    sourceFiles: [path.join(previous, "middleware.ts"), path.join(previous, extensions === generic ? "controllers/admin/fake.ts" : "controllers/admin/panel.ts")],
    compilerOptions: { baseUrl: root, paths } });
}
function schedule(file: string) {
  return analyzeBunwireProgram({ projectRoot: root, bootstrapPath: file,
    sourceRoots: [path.join(previous, "bun/src")], extensions: bun,
    sourceFiles: [path.join(previous, "bun/src/jobs.ts")],
    compilerOptions: { baseUrl: root, paths } });
}
async function registry(file: string, extensions: typeof electro | typeof generic) {
  const output = path.join(path.dirname(file), "registry.ts");
  await writeFile(output, generateRuntimeRegistryModule({ analysis: middleware(file, extensions), extensions, modulePath: output }).code);
  return (await import(pathToFileURL(output).href) as { applicationRegistry: RuntimeRegistry }).applicationRegistry;
}
const middlewareLabels = ["csrf", "audit:global", "auth", "audit:strict", "can:admin.access", "audit:controller", "audit:method"];
const middlewareChain = `defineApp()
  .withMiddlewares((registry) => { registry.use("csrf", "audit:global"); registry.controllers({ "controllers/admin/**": "admin" }); })
  .withMiddlewares((registry) => { configureAdmin(registry); })`;
const helperImport = 'import { configureAdmin } from "../../milestone-18-policy/middleware-barrel.js";';
const scheduleChain = `defineApp()
  .withSchedule((schedule) => { billing(schedule, "daily"); })
  .withSchedule((schedule) => { registerCleanup(schedule); })`;
const scheduleImport = 'import { billing, registerCleanup } from "../../milestone-18-policy/schedule-barrel.js";';

describe("Milestone 19 — repeated Application policy blocks", () => {
  it("accepts repeated Core configuration on the same Application without retaining or running callbacks", async () => {
    let executed = 0;
    const app = defineApp();
    expect(app.withMiddlewares(() => { executed++; })).toBe(app);
    expect(app.withSchedule(() => { executed++; })).toBe(app);
    expect(app.withMiddlewares(() => { executed++; })).toBe(app);
    expect(app.withSchedule(() => { executed++; })).toBe(app);
    expect(() => app.withMiddlewares(undefined as never)).toThrow(TypeError);
    expect(() => app.withSchedule(undefined as never)).toThrow(TypeError);
    await app.start(); expect(executed).toBe(0);
    expect(() => app.withMiddlewares(() => {})).toThrow(ApplicationStateError);
    expect(() => app.withSchedule(() => {})).toThrow(ApplicationStateError);
    await app.stop();
    expect(() => app.withMiddlewares(() => {})).toThrow(ApplicationStateError);
    expect(() => app.withSchedule(() => {})).toThrow(ApplicationStateError);
    expect(executed).toBe(0);
  });

  it("composes middleware blocks and imported helpers with a forward group reference", async () => {
    const source = await bootstrap(middlewareChain, helperImport);
    const panel = middleware(source.file).classes.find((entry) => entry.name === "Panel")!;
    expect(panel.methods[0]!.middleware.map((entry) => entry.target.symbolName.toLowerCase()
      + (entry.parameters.length ? `:${entry.parameters.join(",")}` : ""))).toEqual(middlewareLabels);
  });

  it("composes schedule blocks and imported helpers in chain order", async () => {
    const source = await bootstrap(scheduleChain, scheduleImport);
    expect(schedule(source.file).schedules).toMatchObject([
      { id: "reports.daily", arguments: ["daily", { limit: 6 }], cron: "30 4 * * *", timezone: "UTC" },
      { id: "cleanup", arguments: [], cron: "15 * * * *", lockFor: 1000 },
    ]);
  });

  it("preserves order when middleware and schedule blocks are interleaved", async () => {
    const source = await bootstrap(`defineApp()
      .withMiddlewares((r) => {})
      .withSchedule((s) => { billing(s, "daily"); })
      .withMiddlewares((r) => {})
      .withSchedule((s) => { registerCleanup(s); })`, scheduleImport);
    const result = schedule(source.file);
    expect(result.schedules.map((entry) => entry.id)).toEqual(["reports.daily", "cleanup"]);
  });

  it("rejects duplicate groups and cycles spanning blocks", async () => {
    const duplicate = await bootstrap(`defineApp().withMiddlewares((r) => { r.group("web", [Auth]); })
      .withMiddlewares((r) => { r.group("web", [Audit]); })`);
    expect(() => middleware(duplicate.file)).toThrow(/declared more than once/);
    const cycle = await bootstrap(`defineApp().withMiddlewares((r) => { r.group("a", ["b"]); })
      .withMiddlewares((r) => { r.group("b", ["a"]); })`);
    expect(() => middleware(cycle.file)).toThrow(/Middleware group cycle detected: a -> b -> a/);
  });

  it("rejects duplicate schedule IDs across direct blocks and helper boundaries", async () => {
    const source = await bootstrap(`defineApp()
      .withSchedule((s) => { s.job(Report, "daily", { limit: 6 }).dailyAt("04:30").id("reports.daily"); })
      .withSchedule((s) => { billing(s, "daily"); })`, scheduleImport);
    expect(() => schedule(source.file)).toThrow(/Duplicate generated schedule identity "reports.daily"/);
  });

  it("rejects malformed policy access in any block and ignores unrelated chains", async () => {
    const computed = await bootstrap(`defineApp().withMiddlewares((r) => {}).withMiddlewares((r) => {})["withMiddlewares"]((r) => {})`);
    expect(() => middleware(computed.file)).toThrow(/non-computed property access/);
    const optional = await bootstrap(`defineApp().withSchedule((s) => {}).withSchedule?.((s) => {})`);
    expect(() => schedule(optional.file)).toThrow(/non-optional property access/);
    const other = await bootstrap(`defineApp().withMiddlewares((r) => { r.use(Auth); })`,
      `const unrelated = defineApp().withMiddlewares((r) => { r.group("duplicate", [Auth]); }).withMiddlewares((r) => { r.group("duplicate", [Audit]); });`);
    expect(middleware(other.file).classes.find((entry) => entry.name === "Panel")!.methods[0]!.middleware[0]!.target.symbolName).toBe("Auth");
  });

  it.each(["electrobun", "generic"])("executes composed middleware in layer order through %s", async (adapter) => {
    const source = await bootstrap(middlewareChain, helperImport);
    const extensions = adapter === "generic" ? generic : electro;
    const generated = await registry(source.file, extensions);
    trace.length = 0;
    if (adapter === "generic") {
      const context: Host = {}; const app = defineApp().withAdapter(new PolicyAdapter()).withContext(context).withRuntimeRegistry(generated);
      await app.start(); try { await expect(context.invoke!()).resolves.toBe("admin"); } finally { await app.stop(); }
    } else {
      const rpc = BrowserView.defineRPC({ handlers: { requests: {}, messages: {} } });
      const window = new BrowserWindow({ title: "Blocks", rpc });
      const app = defineApp().withAdapter(new ManualElectrobunAdapter()).withContext(defineElectrobunContext(window)).withRuntimeRegistry(generated);
      await app.start(); try { await expect(rpc.receiveRequest("admin/run", { args: [] })).resolves.toBe("admin"); } finally { await app.stop(); }
    }
    expect(trace).toEqual([...middlewareLabels.map((label) => `before:${label}`), "handler",
      ...[...middlewareLabels].reverse().map((label) => `after:${label}`)]);
  });

  it("runs schedules composed across blocks in a real Bun process", async () => {
    const source = await bootstrap(scheduleChain, scheduleImport);
    const output = path.join(source.directory, "registry.ts");
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

  it("retains byte-identical output for equivalent single-block policies", async () => {
    const multi = await bootstrap(middlewareChain, helperImport);
    const single = await bootstrap(`defineApp().withMiddlewares((r) => {
      r.use("csrf", "audit:global"); r.controllers({ "controllers/admin/**": "admin" }); configureAdmin(r);
    })`, helperImport);
    const output = path.join(fixture, "registry.ts");
    const first = generateRuntimeRegistryModule({ analysis: middleware(multi.file), extensions: electro, modulePath: output });
    const second = generateRuntimeRegistryModule({ analysis: middleware(single.file), extensions: electro, modulePath: output });
    expect(first.code).toBe(second.code); expect(first.hash).toBe(second.hash);
    const scheduled = await bootstrap(scheduleChain, scheduleImport);
    const inline = await bootstrap(`defineApp().withSchedule((s) => { billing(s, "daily"); registerCleanup(s); })`, scheduleImport);
    const firstSchedule = generateRuntimeRegistryModule({ analysis: schedule(scheduled.file), extensions: bun, modulePath: output });
    const secondSchedule = generateRuntimeRegistryModule({ analysis: schedule(inline.file), extensions: bun, modulePath: output });
    expect(firstSchedule.code).toBe(secondSchedule.code); expect(firstSchedule.hash).toBe(secondSchedule.hash);
  });

  it("never imports unrelated Application code while analyzing repeated blocks", async () => {
    const source = await bootstrap(`defineApp().withMiddlewares((r) => { r.use(Auth); }).withMiddlewares((r) => { r.use(Audit); })`);
    const marker = path.join(source.directory, "executed.txt");
    await writeFile(source.file, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "ran");\n${await readFile(source.file, "utf8")}`);
    expect(existsSync(marker)).toBe(false);
    expect(middleware(source.file).classes.length).toBeGreaterThan(0);
    expect(existsSync(marker)).toBe(false);
  });
});
