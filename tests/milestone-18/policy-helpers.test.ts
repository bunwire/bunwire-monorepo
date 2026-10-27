import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";
import { BunAdapter } from "@bunwire/bun";
import { defineApp, type RuntimeRegistry } from "@bunwire/core";
import { ElectrobunAdapter, ManualElectrobunAdapter, defineElectrobunContext } from "@bunwire/electrobun";
import { aggregateCompilerExtensions, analyzeBunwireProgram, generateRuntimeRegistryModule } from "@bunwire/vite";
import { PolicyAdapter, type Host } from "../fixtures/milestone-17-policy/adapter.js";
import { trace } from "../fixtures/milestone-17-policy/middleware.js";
import { BrowserView, BrowserWindow } from "../fixtures/milestone-11-electrobun/fake-native.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = path.join(root, "tests/fixtures/milestone-18-policy");
const previous = path.join(root, "tests/fixtures/milestone-17-policy");
const directories: string[] = [];
const paths = { "@bunwire/core": ["packages/core/src/index.ts"], "@bunwire/bun": ["packages/bun/src/index.ts"],
  "@bunwire/electrobun": ["packages/electrobun/src/index.ts"], "proof-static": ["tests/fixtures/milestone-16-static-metadata/adapter.ts"] };
const electro = aggregateCompilerExtensions(ElectrobunAdapter.compiler);
const generic = aggregateCompilerExtensions(PolicyAdapter.compiler);
const bun = aggregateCompilerExtensions(BunAdapter.compiler);
async function temporary() { const directory = await mkdtemp(path.join(fixture, ".generated-")); directories.push(directory); return directory; }
afterAll(async () => { for (const directory of directories) {
  if (path.dirname(directory) !== fixture || !path.basename(directory).startsWith(".generated-")) throw new Error("Unsafe cleanup target");
  await rm(directory, { recursive: true, force: true });
} });
function middleware(bootstrap: string, extensions = electro) {
  return analyzeBunwireProgram({ projectRoot: root, bootstrapPath: bootstrap, sourceRoots: [previous], extensions,
    sourceFiles: [path.join(previous, "middleware.ts"), path.join(previous, extensions === generic ? "controllers/admin/fake.ts" : "controllers/admin/panel.ts")],
    compilerOptions: { baseUrl: root, paths } });
}
function schedule(bootstrap: string) {
  return analyzeBunwireProgram({ projectRoot: root, bootstrapPath: bootstrap, sourceRoots: [path.join(previous, "bun/src")], extensions: bun,
    sourceFiles: [path.join(previous, "bun/src/jobs.ts")], compilerOptions: { baseUrl: root, paths } });
}
async function policyCase(body: string, prelude = "", imported = "") {
  const directory = await temporary();
  const bootstrap = path.join(directory, "bootstrap.ts");
  if (imported) await writeFile(path.join(directory, "helpers.ts"), imported);
  await writeFile(bootstrap, `import { defineApp } from "@bunwire/core"; import { Auth, Audit } from "../../milestone-17-policy/middleware.js"; ${prelude}\nexport default defineApp().withMiddlewares((registry) => { ${body} });`);
  return { directory, bootstrap, run: () => middleware(bootstrap) };
}
async function scheduleCase(body: string, prelude = "", imported = "") {
  const directory = await temporary();
  const bootstrap = path.join(directory, "bootstrap.ts");
  if (imported) await writeFile(path.join(directory, "helpers.ts"), imported);
  await writeFile(bootstrap, `import { defineApp } from "@bunwire/core"; import { Report, Cleanup } from "../../milestone-17-policy/bun/src/jobs.js"; ${prelude}\nexport default defineApp().withSchedule((schedule) => { ${body} });`);
  return { directory, bootstrap, run: () => schedule(bootstrap) };
}

describe("Milestone 18 — static policy helpers", () => {
  it("expands imported middleware helpers through a re-export, nested calls, and lexical constants", async () => {
    const fixture = await policyCase('registry.use("csrf", "audit:global"); configureAdmin(registry);',
      'import { configureAdmin } from "../middleware-barrel.js";');
    const panel = fixture.run().classes.find((entry) => entry.name === "Panel")!;
    expect(panel.methods[0]!.middleware.map((entry) => entry.target.symbolName.toLowerCase()
      + (entry.parameters.length ? ":" + entry.parameters.join(",") : "")))
      .toEqual(["csrf", "audit:global", "auth", "audit:strict", "can:admin.access", "audit:controller", "audit:method"]);
  });

  it("expands imported billing schedules with static parameters, cadence, and modifiers", async () => {
    const fixture = await scheduleCase('billing(schedule, "daily"); registerCleanup(schedule);',
      'import { billing, registerCleanup } from "../schedule-barrel.js";');
    expect(fixture.run().schedules).toMatchObject([
      { id: "reports.daily", arguments: ["daily", { limit: 6 }], cron: "30 4 * * *", timezone: "UTC" },
      { id: "cleanup", arguments: [], cron: "15 * * * *", lockFor: 1000 },
    ]);
  });

  it.each(["electrobun", "generic"])("executes helper-derived middleware through %s", async (adapter) => {
    const fixture = await policyCase('registry.use("csrf", "audit:global"); configureAdmin(registry);',
      'import { configureAdmin } from "../middleware-barrel.js";');
    const extensions = adapter === "generic" ? generic : electro;
    const output = path.join(fixture.directory, "registry.ts");
    await writeFile(output, generateRuntimeRegistryModule({ analysis: middleware(fixture.bootstrap, extensions), extensions, modulePath: output }).code);
    const { applicationRegistry } = await import(pathToFileURL(output).href) as { applicationRegistry: RuntimeRegistry };
    trace.length = 0;
    if (adapter === "generic") {
      const context: Host = {};
      const app = defineApp().withAdapter(new PolicyAdapter()).withContext(context).withRuntimeRegistry(applicationRegistry);
      await app.start(); try { await expect(context.invoke!()).resolves.toBe("admin"); } finally { await app.stop(); }
    } else {
      const rpc = BrowserView.defineRPC({ handlers: { requests: {}, messages: {} } });
      const window = new BrowserWindow({ title: "Helpers", rpc });
      const app = defineApp().withAdapter(new ManualElectrobunAdapter()).withContext(defineElectrobunContext(window)).withRuntimeRegistry(applicationRegistry);
      await app.start(); try { await expect(rpc.receiveRequest("admin/run", { args: [] })).resolves.toBe("admin"); } finally { await app.stop(); }
    }
    const labels = ["csrf", "audit:global", "auth", "audit:strict", "can:admin.access", "audit:controller", "audit:method"];
    expect(trace).toEqual([...labels.map((label) => `before:${label}`), "handler", ...labels.reverse().map((label) => `after:${label}`)]);
  });

  it("delivers helper-derived job arguments in a real Bun scheduler process", async () => {
    const fixture = await scheduleCase('billing(schedule, "daily"); registerCleanup(schedule);',
      'import { billing, registerCleanup } from "../schedule-barrel.js";');
    const output = path.join(fixture.directory, "registry.ts");
    await writeFile(output, generateRuntimeRegistryModule({ analysis: fixture.run(), extensions: bun, modulePath: output }).code);
    const text = await new Promise<string>((resolve, reject) => {
      const child = spawn("bun", [path.join(root, "tests/milestone-17/fixtures/scheduler-child.ts"), output], { cwd: root, stdio: "pipe" });
      let result = ""; const timeout = setTimeout(() => { child.kill(); reject(new Error(`Scheduler child timeout: ${result}`)); }, 20000);
      child.stdout.on("data", (chunk) => { result += chunk.toString(); }); child.stderr.on("data", (chunk) => { result += chunk.toString(); });
      child.on("error", (error) => { clearTimeout(timeout); reject(error); });
      child.on("exit", (code) => { clearTimeout(timeout); code === 0 ? resolve(result) : reject(new Error(result)); });
    });
    expect(text).toContain("COMPOSED_SCHEDULE_OK");
  });

  it("accepts named callbacks and local arrow/function helpers", async () => {
    const fixture = await policyCase("", `
      function configure(registry: import("@bunwire/core").MiddlewarePolicyRegistry) {
        const alias = "auth";
        const nested = (r: import("@bunwire/core").MiddlewarePolicyRegistry, value: string) => { r.use(value); };
        nested(registry, alias);
      }
    `);
    await writeFile(fixture.bootstrap, (await readFile(fixture.bootstrap, "utf8")).replace(".withMiddlewares((registry) => {  })", ".withMiddlewares(configure)"));
    expect(fixture.run().classes.find((entry) => entry.name === "Panel")!.methods[0]!.middleware[0]!.target.symbolName).toBe("Auth");
  });

  it("expands callback-local function declarations and const function expressions", async () => {
    const fixture = await policyCase(`
      function first(r: import("@bunwire/core").MiddlewarePolicyRegistry) { r.use("auth"); }
      const second = function (r: import("@bunwire/core").MiddlewarePolicyRegistry) { r.use("audit:local"); };
      first(registry); second(registry);
    `);
    const pipeline = fixture.run().classes.find((entry) => entry.name === "Panel")!.methods[0]!.middleware;
    expect(pipeline.map((entry) => entry.target.symbolName.toLowerCase()
      + (entry.parameters.length ? `:${entry.parameters.join(",")}` : "")))
      .toEqual(["auth", "audit:local", "audit:controller", "audit:method"]);
  });

  it("preserves lexical captures in a nested local helper", async () => {
    const fixture = await policyCase(`
      const alias = "auth";
      function nested() { registry.use(alias); }
      nested();
    `);
    expect(fixture.run().classes.find((entry) => entry.name === "Panel")!.methods[0]!.middleware[0]!.target.symbolName).toBe("Auth");
  });

  it("accepts an imported named callback through a local const alias", async () => {
    const fixture = await policyCase("", `
      import { configureAdmin } from "../middleware-barrel.js";
      const callback = configureAdmin;
    `);
    await writeFile(fixture.bootstrap, (await readFile(fixture.bootstrap, "utf8")).replace(".withMiddlewares((registry) => {  })", ".withMiddlewares(callback)"));
    expect(fixture.run().classes.find((entry) => entry.name === "Panel")!.methods[0]!.middleware
      .map((entry) => entry.target.symbolName.toLowerCase()))
      .toEqual(["csrf", "auth", "audit", "can", "audit", "audit"]);
  });

  it("keeps TypeScript callback compatibility checks for named helpers", async () => {
    const fixture = await policyCase("", `
      function wrong(schedule: import("@bunwire/core").ApplicationScheduleRegistry) {}
    `);
    await writeFile(fixture.bootstrap, (await readFile(fixture.bootstrap, "utf8")).replace(".withMiddlewares((registry) => {  })", ".withMiddlewares(wrong)"));
    expect(fixture.run).toThrowError(expect.objectContaining({ code: "MIDDLEWARE_POLICY_INVALID", message: expect.stringMatching(/not type-correct/) }));
  });

  it("keeps helper-based generated middleware and schedule records byte-identical to inline policies", async () => {
    const one = await policyCase('registry.use("csrf", "audit:global"); configureAdmin(registry);',
      'import { configureAdmin } from "../middleware-barrel.js";');
    const output = path.join(one.directory, "registry.ts");
    const composed = generateRuntimeRegistryModule({ analysis: one.run(), extensions: electro, modulePath: output });
    await writeFile(one.bootstrap, (await readFile(one.bootstrap, "utf8")).replace('configureAdmin(registry);',
      'registry.group("web", ["csrf", "auth", "audit:strict"]); registry.group("admin", ["csrf", "auth", "audit:strict", "can:admin.access"]); registry.controllers({ "controllers/admin/**": "admin" });'));
    const inline = generateRuntimeRegistryModule({ analysis: one.run(), extensions: electro, modulePath: output });
    expect(composed.code).toBe(inline.code); expect(composed.hash).toBe(inline.hash);
    const two = await scheduleCase('billing(schedule, "daily"); registerCleanup(schedule);',
      'import { billing, registerCleanup } from "../schedule-barrel.js";');
    const scheduleOutput = path.join(two.directory, "registry.ts");
    const composedSchedule = generateRuntimeRegistryModule({ analysis: two.run(), extensions: bun, modulePath: scheduleOutput });
    await writeFile(two.bootstrap, (await readFile(two.bootstrap, "utf8")).replace('billing(schedule, "daily"); registerCleanup(schedule);',
      'schedule.job(Report, "daily", { limit: 6 }).dailyAt("04:30").timezone("UTC").id("reports.daily").withoutOverlapping(); schedule.task(Cleanup).hourlyAt(15).id("cleanup").lockFor(1000);'));
    const inlineSchedule = generateRuntimeRegistryModule({ analysis: two.run(), extensions: bun, modulePath: scheduleOutput });
    expect(composedSchedule.code).toBe(inlineSchedule.code); expect(composedSchedule.hash).toBe(inlineSchedule.hash);
  });

  it("does not execute application module top-level code or helper bodies", async () => {
    const directory = await temporary(); const marker = path.join(directory, "executed.txt");
    const helper = path.join(directory, "helpers.ts"); const bootstrap = path.join(directory, "bootstrap.ts");
    await writeFile(helper, `import { writeFileSync } from "node:fs"; import type { MiddlewarePolicyRegistry } from "@bunwire/core"; writeFileSync(${JSON.stringify(marker)}, "top-level"); export function register(r: MiddlewarePolicyRegistry) { r.use("auth"); }`);
    await writeFile(bootstrap, 'import { defineApp } from "@bunwire/core"; import { register } from "./helpers.js"; export default defineApp().withMiddlewares(register);');
    expect(existsSync(marker)).toBe(false);
    expect(middleware(bootstrap).classes).toBeTruthy();
    expect(existsSync(marker)).toBe(false);
  });

  it("typechecks ordinary helper examples through the public Core callback types", () => {
    const compilerOptions: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, noEmit: true, skipLibCheck: true, baseUrl: root, paths };
    const program = ts.createProgram([path.join(fixture, "middleware-helpers.ts"), path.join(fixture, "schedule-helpers.ts")], compilerOptions);
    expect(program.getSemanticDiagnostics().filter((entry) => entry.file?.fileName.startsWith(fixture))
      .map((entry) => ts.flattenDiagnosticMessageText(entry.messageText, "\n"))).toEqual([]);
  });

  it("resolves namespace helper members and lexical shadowing by TypeScript symbol", async () => {
    const fixture = await policyCase('const alias = "auth"; H.attach(registry); nested(registry, alias);', `
      import * as H from "../namespace-barrel.js";
      function nested(r: import("@bunwire/core").MiddlewarePolicyRegistry, alias: string) {
        const value = "audit:inner";
        r.use(alias, value);
      }
    `);
    const pipeline = fixture.run().classes.find((entry) => entry.name === "Panel")!.methods[0]!.middleware;
    expect(pipeline.map((entry) => entry.target.symbolName.toLowerCase()
      + (entry.parameters.length ? ":" + entry.parameters.join(",") : "")))
      .toEqual(["auth", "audit:inner", "audit:controller", "audit:method"]);
  });

  it("can reach one helper in a module containing other dormant policy helpers", async () => {
    const fixture = await policyCase('H.registerWeb(registry); registry.use("web");',
      'import * as H from "../middleware-helpers.js";');
    expect(fixture.run().classes.find((entry) => entry.name === "Panel")!.methods[0]!.middleware
      .map((entry) => entry.target.symbolName.toLowerCase()))
      .toEqual(["csrf", "auth", "audit", "audit", "audit"]);
  });

  it("does not authorize counterfeit same-name methods to consume static collections", async () => {
    const fixture = await policyCase('registry.use(...VALUES);', `
      const VALUES = ["auth"];
      const fake = { group(_name: string, _values: readonly string[]) {} };
      fake.group("x", VALUES);
    `);
    expect(fixture.run).toThrow(/mutating call or value escape/);
  });

  it("expands repeated calls at each site, retaining canonical deduplication and duplicate group errors", async () => {
    const repeated = await policyCase('attach(registry); attach(registry);', `
      function attach(r: import("@bunwire/core").MiddlewarePolicyRegistry) { r.use("auth"); }
    `);
    expect(repeated.run().classes.find((entry) => entry.name === "Panel")!.methods[0]!.middleware
      .filter((entry) => entry.target.symbolName === "Auth")).toHaveLength(1);
    const duplicate = await policyCase('register(registry); register(registry);', `
      function register(r: import("@bunwire/core").MiddlewarePolicyRegistry) { r.group("same", ["auth"]); }
    `);
    expect(duplicate.run).toThrowError(expect.objectContaining({ code: "MIDDLEWARE_POLICY_INVALID", message: expect.stringMatching(/more than once.*Policy helper path/s) }));
    const jobs = await scheduleCase('register(schedule); register(schedule);', `
      function register(s: import("@bunwire/core").ApplicationScheduleRegistry) { s.task(Cleanup).everyMinute().id("same"); }
    `);
    expect(jobs.run).toThrowError(expect.objectContaining({ code: "SCHEDULE_POLICY_INVALID", message: expect.stringMatching(/Duplicate generated schedule identity/) }));
  });

  it("reports invalid imported values with the helper definition and caller path", async () => {
    const fixture = await policyCase('attach(registry);', 'import { attach } from "./helpers.js";', `
      import type { MiddlewarePolicyRegistry } from "@bunwire/core";
      const BAD = "missing";
      export function attach(r: MiddlewarePolicyRegistry) { r.use(BAD); }
    `);
    expect(fixture.run).toThrowError(expect.objectContaining({ code: "MIDDLEWARE_POLICY_INVALID",
      message: expect.stringMatching(/unknown alias.*Policy helper path:.*attach.*called at/s),
      location: expect.objectContaining({ filePath: path.join(fixture.directory, "helpers.ts"), line: 3 }) }));
  });

  it("keeps imported schedule validation origins and helper call paths", async () => {
    const fixture = await scheduleCase('register(schedule);', 'import { register } from "./helpers.js";', `
      import type { ApplicationScheduleRegistry } from "@bunwire/core";
      import { Cleanup } from "../../milestone-17-policy/bun/src/jobs.js";
      const TIME = "25:00";
      export function register(s: ApplicationScheduleRegistry) { s.task(Cleanup).dailyAt(TIME); }
    `);
    expect(fixture.run).toThrowError(expect.objectContaining({ code: "SCHEDULE_POLICY_INVALID",
      message: expect.stringMatching(/HH:mm.*Policy helper path:.*register.*called at/s),
      location: expect.objectContaining({ filePath: path.join(fixture.directory, "helpers.ts"), line: 4 }) }));
  });

  it("keeps helper paths on group cycles and invalid Controller mappings", async () => {
    const cycle = await policyCase('groups(registry);', `
      function groups(r: import("@bunwire/core").MiddlewarePolicyRegistry) { r.group("a", ["b"]); r.group("b", ["a"]); }
    `);
    expect(cycle.run).toThrowError(expect.objectContaining({ code: "MIDDLEWARE_GROUP_CYCLE", message: expect.stringMatching(/a -> b -> a.*Policy helper path:/s) }));
    const pattern = await policyCase('mapping(registry);', `
      function mapping(r: import("@bunwire/core").MiddlewarePolicyRegistry) { r.controllers({ "../bad/**": "auth" }); }
    `);
    expect(pattern.run).toThrowError(expect.objectContaining({ code: "MIDDLEWARE_CONTROLLER_PATTERN_INVALID", message: expect.stringMatching(/relative path.*Policy helper path:/s) }));
  });

  it("rejects helper source in dependency packages", async () => {
    const directory = await temporary(); const dependency = path.join(directory, "node_modules", "example");
    await mkdir(dependency, { recursive: true });
    await writeFile(path.join(dependency, "helper.ts"), 'import type { MiddlewarePolicyRegistry } from "@bunwire/core"; export function attach(r: MiddlewarePolicyRegistry) { r.use("auth"); }');
    const bootstrap = path.join(directory, "bootstrap.ts");
    await writeFile(bootstrap, 'import { defineApp } from "@bunwire/core"; import { attach } from "./node_modules/example/helper.js"; export default defineApp().withMiddlewares(attach);');
    expect(() => middleware(bootstrap)).toThrow(/source escapes.*dependency package/);
  });

  it("bounds nested helper expansion with the shared depth budget", async () => {
    const registry = 'import("@bunwire/core").MiddlewarePolicyRegistry';
    const definitions = Array.from({ length: 70 }, (_, index) => `function f${index}(r: ${registry}) { ${index === 69 ? 'r.use("auth");' : `f${index + 1}(r);`} }`).join("\n");
    const fixture = await policyCase("f0(registry);", definitions);
    expect(fixture.run).toThrow(/depth budget \(64\).*Policy helper path/s);
  });

  it.each([
    ['function recur(r: import("@bunwire/core").MiddlewarePolicyRegistry) { recur(r); }', 'recur(registry);', /Recursive policy helper call/],
    ['function first(r: import("@bunwire/core").MiddlewarePolicyRegistry) { second(r); } function second(r: import("@bunwire/core").MiddlewarePolicyRegistry) { first(r); }', 'first(registry);', /Recursive policy helper call/],
    ['async function helper(r: import("@bunwire/core").MiddlewarePolicyRegistry) { r.use("auth"); }', 'helper(registry);', /synchronous block bodies/],
    ['function* helper(r: import("@bunwire/core").MiddlewarePolicyRegistry) { r.use("auth"); }', 'helper(registry);', /synchronous block bodies/],
    ['function helper({ use }: import("@bunwire/core").MiddlewarePolicyRegistry) { use("auth"); }', 'helper(registry);', /plain identifier parameters/],
    ['function helper(r: import("@bunwire/core").MiddlewarePolicyRegistry, value = "auth") { r.use(value); }', 'helper(registry);', /plain identifier parameters|requires 2 arguments/],
    ['function helper(r: import("@bunwire/core").MiddlewarePolicyRegistry, ...values: string[]) { r.use(...values); }', 'helper(registry, "auth");', /plain identifier parameters/],
    ['function helper(r: import("@bunwire/core").MiddlewarePolicyRegistry) { r.use("auth"); }', 'helper(registry, "extra");', /requires 1 arguments/],
    ['const helper = factory(); function factory() { return (r: import("@bunwire/core").MiddlewarePolicyRegistry) => r.use("auth"); }', 'helper(registry);', /target must be a direct function symbol or const alias/],
    ['function helper(r: import("@bunwire/core").MiddlewarePolicyRegistry) { const saved = r; saved.use("auth"); }', 'helper(registry);', /Registry capability cannot be stored/],
    ['function helper(r: import("@bunwire/core").MiddlewarePolicyRegistry) { return r; }', 'helper(registry);', /supports only const declarations and direct policy\/helper calls/],
    ['function helper(r: import("@bunwire/core").MiddlewarePolicyRegistry) { if (true) r.use("auth"); }', 'helper(registry);', /supports only const declarations and direct policy\/helper calls/],
    ['function helper(r: import("@bunwire/core").MiddlewarePolicyRegistry) { r.task(Auth); }', 'helper(registry);', /Unsupported middleware policy call/],
    ['function helper(r: import("@bunwire/core").MiddlewarePolicyRegistry, value: string) { r.use(value); }', 'helper(registry, factory()); function factory() { return "auth"; }', /arbitrary calls/],
    ['function helper(r: import("@bunwire/core").MiddlewarePolicyRegistry, value: number) { r.use("auth"); }', 'helper(registry, "wrong");', /not type-correct/],
  ] as const)("rejects unsupported middleware helper: %s", async (prelude, body, message) => {
    const fixture = await policyCase(body, prelude);
    expect(fixture.run).toThrowError(expect.objectContaining({ message: expect.stringMatching(message) }));
  });

  it.each([
    ['function helper(s: import("@bunwire/core").ApplicationScheduleRegistry) { s.use("auth"); }', 'helper(schedule);', /Unsupported schedule registry method/],
    ['function helper(s: import("@bunwire/core").ApplicationScheduleRegistry) { s.task(Cleanup).everyMinute(); }', 'helper(schedule, 1);', /requires 1 arguments/],
    ['function helper(s: import("@bunwire/core").ApplicationScheduleRegistry) { s.job(Report, "daily", { limit: 6 }).dailyAt("25:00"); }', 'helper(schedule);', /HH:mm/],
  ] as const)("rejects invalid schedule helper: %s", async (prelude, body, message) => {
    const fixture = await scheduleCase(body, prelude);
    expect(fixture.run).toThrowError(expect.objectContaining({ code: "SCHEDULE_POLICY_INVALID", message: expect.stringMatching(message) }));
  });

  it("rejects a callable result from an arbitrary middleware local initializer", async () => {
    const fixture = await policyCase('const ignored = factory(); registry.use("auth");',
      'function factory() { return () => "auth"; }');
    expect(fixture.run).toThrowError(expect.objectContaining({
      code: "MIDDLEWARE_POLICY_INVALID", message: expect.stringMatching(/arbitrary calls are unsupported/),
      location: expect.objectContaining({ filePath: fixture.bootstrap, line: 2 }),
    }));
  });

  it("preserves a local const alias to a supported policy helper", async () => {
    const fixture = await policyCase('const alias = configure; alias(registry);',
      'function configure(r: import("@bunwire/core").MiddlewarePolicyRegistry) { r.use("auth"); }');
    expect(fixture.run().classes.find((entry) => entry.name === "Panel")!.methods[0]!.middleware[0]!.target.symbolName)
      .toBe("Auth");
  });

  it("rejects a callable result from an arbitrary schedule local initializer", async () => {
    const fixture = await scheduleCase('const ignored = factory(); schedule.job(Report).dailyAt("04:00");',
      'function factory() { return () => "ignored"; }');
    expect(fixture.run).toThrowError(expect.objectContaining({
      code: "SCHEDULE_POLICY_INVALID", message: expect.stringMatching(/arbitrary calls are unsupported/),
      location: expect.objectContaining({ filePath: fixture.bootstrap, line: 2 }),
    }));
  });
});
