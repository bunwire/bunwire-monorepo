import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { CONTROLLER_KIND, defineAdapterCompilerDescriptor, defineCompilerMetadataHandler, defineApp, type ApplicationScheduleCompilationHandlerData, type RuntimeRegistry } from "@bunwire/core";
import { BunAdapter } from "@bunwire/bun";
import { ElectrobunAdapter, ManualElectrobunAdapter, defineElectrobunContext } from "@bunwire/electrobun";
import { aggregateCompilerExtensions, analyzeBunwireProgram, generateRuntimeRegistryModule, generateBunwireArtifacts } from "@bunwire/vite";
import { PolicyAdapter, type Host } from "../fixtures/milestone-17-policy/adapter.js";
import { trace } from "../fixtures/milestone-17-policy/middleware.js";
import { BrowserView, BrowserWindow } from "../fixtures/milestone-11-electrobun/fake-native.js";
import { Handle, METHOD_KIND } from "../fixtures/milestone-16-static-metadata/adapter.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = path.join(root, "tests/fixtures/milestone-17-policy");
const directories: string[] = [];
const paths = { "@bunwire/core": ["packages/core/src/index.ts"], "@bunwire/bun": ["packages/bun/src/index.ts"],
  "@bunwire/electrobun": ["packages/electrobun/src/index.ts"], "proof-static": ["tests/fixtures/milestone-16-static-metadata/adapter.ts"] };
async function temporary() { const directory = await mkdtemp(path.join(fixture, ".generated-")); directories.push(directory); return directory; }
afterAll(async () => { for (const directory of directories) {
  if (path.dirname(directory) !== fixture || !path.basename(directory).startsWith(".generated-")) throw new Error("Unsafe cleanup target");
  await rm(directory, { recursive: true, force: true });
} });
const electro = aggregateCompilerExtensions(ElectrobunAdapter.compiler);
const generic = aggregateCompilerExtensions(PolicyAdapter.compiler);
const bun = aggregateCompilerExtensions(BunAdapter.compiler);
function middleware(bootstrap = path.join(fixture, "bootstrap.ts"), extensions = electro) {
  return analyzeBunwireProgram({ projectRoot: root, bootstrapPath: bootstrap, sourceRoots: [fixture], extensions,
    sourceFiles: [path.join(fixture, "middleware.ts"), path.join(fixture, extensions === generic ? "controllers/admin/fake.ts" : "controllers/admin/panel.ts")], compilerOptions: { baseUrl: root, paths } });
}
function schedule(bootstrap = path.join(fixture, "bun/src/bootstrap.ts")) {
  return analyzeBunwireProgram({ projectRoot: root, bootstrapPath: bootstrap, sourceRoots: [path.join(fixture, "bun/src")], extensions: bun,
    sourceFiles: [path.join(fixture, "bun/src/jobs.ts")], compilerOptions: { baseUrl: root, paths } });
}
async function load(analysis: ReturnType<typeof middleware>, extensions = electro) {
  const directory = await temporary(); const file = path.join(directory, "registry.ts");
  const generated = generateRuntimeRegistryModule({ analysis, extensions, modulePath: file });
  await writeFile(file, generated.code);
  return (await import(pathToFileURL(file).href) as { applicationRegistry: RuntimeRegistry }).applicationRegistry;
}
async function policyCase(body: string, prelude = "", imported = "") {
  const directory = await temporary(); const target = path.join(directory, "policy.ts");
  if (imported) await writeFile(path.join(directory, "values.ts"), imported);
  await writeFile(target, `import { defineApp } from "@bunwire/core"; import { Csrf, Auth, Audit, Can } from "../middleware.js"; ${prelude}\nexport default defineApp().withMiddlewares((registry) => { ${body} });`);
  return { directory, target, run: () => middleware(target) };
}
async function scheduleCase(body: string, prelude = "", imported = "") {
  const directory = await temporary(); const target = path.join(directory, "schedule.ts");
  if (imported) await writeFile(path.join(directory, "values.ts"), imported);
  await writeFile(target, `import { defineApp } from "@bunwire/core"; import { Report, Cleanup } from "../bun/src/jobs.js"; ${prelude}\nexport default defineApp().withSchedule((schedule) => { ${body} });`);
  return { directory, target, run: () => schedule(target) };
}
const labels = ["csrf", "audit:global", "auth", "audit:strict", "can:admin.access", "audit:controller", "audit:method"];
const expectedTrace = [...labels.map((label) => "before:" + label), "handler", ...[...labels].reverse().map((label) => "after:" + label)];

describe("Milestone 17 — composable static policies", () => {
  it("resolves the COMMON_SECURITY/ADMIN_GLOB examples with mixed canonical classes and aliases", () => {
    const analysis = middleware();
    const pipeline = analysis.classes.find((entry) => entry.name === "Panel")!.methods[0]!.middleware;
    expect(pipeline.map((entry) => entry.target.symbolName.toLowerCase() + (entry.parameters.length ? ":" + entry.parameters.join(",") : ""))).toEqual(labels);
  });

  it.each(["electrobun", "generic"])("executes composed middleware in the four-layer order through %s", async (adapter) => {
    trace.length = 0;
    if (adapter === "generic") {
      const registry = await load(middleware(undefined, generic), generic); const context: Host = {};
      const app = defineApp().withAdapter(new PolicyAdapter()).withContext(context).withRuntimeRegistry(registry);
      await app.start(); try { await expect(context.invoke!()).resolves.toBe("admin"); } finally { await app.stop(); }
    } else {
      const registry = await load(middleware());
      const rpc = BrowserView.defineRPC({ handlers: { requests: {}, messages: {} } });
      const window = new BrowserWindow({ title: "Policy", rpc });
      const app = defineApp().withAdapter(new ManualElectrobunAdapter()).withContext(defineElectrobunContext(window)).withRuntimeRegistry(registry);
      await app.start(); try { await expect(rpc.receiveRequest("admin/run", { args: [] })).resolves.toBe("admin"); } finally { await app.stop(); }
    }
    expect(trace).toEqual(expectedTrace);
  });

  it("resolves known schedule targets, spread payloads, cadence, timezone, IDs, and modifiers", () => {
    expect(schedule().schedules).toMatchObject([
      { id: "reports.daily", execution: "job", arguments: ["daily", { limit: 6 }], cron: "30 4 * * *", timezone: "UTC", overlap: "without-overlap" },
      { id: "cleanup", execution: "direct", arguments: [], cron: "15 * * * *", lockFor: 1000 },
    ]);
  });

  it("delivers composed job arguments through the generated registry and real Bun scheduler", async () => {
    const directory = await temporary();
    const output = await generateBunwireArtifacts({ root: path.join(fixture, "bun"), generatedModulePath: path.join(directory, "registry.ts"),
      generatedClientModulePath: path.join(directory, "client.ts"), generatedDeclarationsPath: path.join(directory, "virtual.d.ts") });
    const text = await new Promise<string>((resolve, reject) => {
      const child = spawn("bun", [path.join(root, "tests/milestone-17/fixtures/scheduler-child.ts"), output.paths.registry], { cwd: root, stdio: "pipe" });
      let text = ""; const timeout = setTimeout(() => { child.kill(); reject(new Error(`Scheduler child timeout: ${text}`)); }, 20000);
      child.stdout.on("data", (chunk) => { text += chunk.toString(); }); child.stderr.on("data", (chunk) => { text += chunk.toString(); });
      child.on("error", (error) => { clearTimeout(timeout); reject(error); });
      child.on("exit", (code) => { clearTimeout(timeout); code === 0 ? resolve(text) : reject(new Error(text)); });
    });
    expect(text).toContain("COMPOSED_SCHEDULE_OK");
  });

  it("emits byte-identical normalized records for inline and composed declarations", async () => {
    const directory = await temporary(); const target = path.join(directory, "equivalent.ts");
    const composed = (await readFile(path.join(fixture, "bootstrap.ts"), "utf8")).replace('"./barrel.js"', '"../barrel.js"');
    await writeFile(target, composed);
    const first = generateRuntimeRegistryModule({ analysis: middleware(target), extensions: electro, modulePath: path.join(directory, "registry.ts") });
    const inline = composed.replace("registry.use(...GLOBAL)", 'registry.use("csrf", "audit:global")').replace("registry.group(...GROUP_ARGS)", 'registry.group("web", ["csrf", "auth", "audit:strict"])')
      .replace('[...COMMON_SECURITY, "can:admin.access"]', '["csrf", "auth", "audit:strict", "can:admin.access"]').replace("registry.controllers(ADMIN_MAPPING)", 'registry.controllers({ "controllers/admin/**": "admin" })');
    await writeFile(target, inline);
    const second = generateRuntimeRegistryModule({ analysis: middleware(target), extensions: electro, modulePath: path.join(directory, "registry.ts") });
    expect(second.code).toBe(first.code); expect(second.hash).toBe(first.hash);
  });

  it("emits equivalent schedules for inline values and composed targets/arguments", async () => {
    const directory = await temporary(); const target = path.join(directory, "same-schedule.ts");
    const composed = (await readFile(path.join(fixture, "bun/src/bootstrap.ts"), "utf8"))
      .replace('"./jobs.js"', '"../bun/src/jobs.js"').replace('"../values.js"', '"../bun/values.js"');
    await writeFile(target, composed);
    const first = generateRuntimeRegistryModule({ analysis: schedule(target), extensions: bun, modulePath: path.join(directory, "registry.ts") });
    await writeFile(target, composed.replace("JOBS[0], ...PAYLOAD", 'Report, "daily", { limit: 6 }').replace("dailyAt(TIME)", 'dailyAt("04:30")')
      .replace("timezone(TIMEZONE)", 'timezone("UTC")').replace("id(ID)", 'id("reports.daily")').replace("hourlyAt(...MINUTE_ARGS)", "hourlyAt(15)").replace("lockFor(LOCK)", "lockFor(1000)"));
    const second = generateRuntimeRegistryModule({ analysis: schedule(target), extensions: bun, modulePath: path.join(directory, "registry.ts") });
    expect(second.code).toBe(first.code); expect(second.hash).toBe(first.hash);
  });

  it.each([
    ['registry.use(...([] as const));', "", "MIDDLEWARE_POLICY_INVALID", /at least one/],
    ['registry.use("missing");', "", "MIDDLEWARE_POLICY_INVALID", /unknown alias/],
    ['registry.group("a", ["b"]); registry.group("b", ["a"]);', "", "MIDDLEWARE_GROUP_CYCLE", /a -> b -> a/],
    ['registry.group(NAME, [Auth]); registry.group(NAME, [Audit]);', 'const NAME = "same";', "MIDDLEWARE_POLICY_INVALID", /more than once/],
    ['registry.use(Fake);', 'class Fake { handle() {} }', "MIDDLEWARE_POLICY_INVALID", /canonical/],
    ['registry.use(REF);', 'const REF = "Auth";', "MIDDLEWARE_POLICY_INVALID", /unknown alias/],
    ['registry.use(...REFS);', 'const REFS = ["auth"]; REFS.push("audit");', "DECORATOR_ARGUMENT_INVALID", /mutating call/],
    ['registry.use(...REFS);', 'const REFS = ["auth"]; const alias = REFS; alias[0] = "audit";', "DECORATOR_ARGUMENT_INVALID", /detected write/],
    ['registry.use(factory());', 'const factory = () => "auth";', "MIDDLEWARE_POLICY_INVALID", /arbitrary calls/],
    ['registry.group("empty", []);', "", "MIDDLEWARE_POLICY_INVALID", /at least one/],
  ] as const)("rejects invalid composed middleware: %s", async (body, prelude, code, message) => {
    const fixture = await policyCase(body, prelude);
    expect(fixture.run).toThrowError(expect.objectContaining({ code, message: expect.stringMatching(message) }));
  });

  it.each([
    ['schedule.task(Report).everyMinute();', "", /allowed canonical kind/],
    ['schedule.task(Fake).everyMinute();', 'class Fake { handle() {} }', /allowed canonical kind/],
    ['schedule.job(REF, "daily", { limit: 1 }).everyMinute();', 'const REF = "Report" as unknown as typeof Report;', /allowed canonical kind/],
    ['(schedule.job as (...args: unknown[]) => ReturnType<typeof schedule.job>)(Report, ...ARGS).everyMinute();', 'const ARGS = ["only-one"] as const;', /arguments do not satisfy/],
    ['schedule.task(Cleanup).hourlyAt(MINUTE);', 'const MINUTE = 60;', /minute must be 0..59/],
    ['schedule.task(Cleanup).dailyAt(TIME);', 'const TIME = "25:00";', /HH:mm/],
    ['schedule.task(Cleanup).everyMinute().timezone(ZONE);', 'const ZONE = "Not/A_Zone";', /timezone/],
    ['schedule.task(Cleanup).everyMinute().id(ID); schedule.task(Cleanup).hourlyAt(15).id(ID);', 'const ID = "duplicate";', /Duplicate generated schedule identity/],
    ['schedule.job(Report, "daily", BAD as unknown as {limit: number}).everyMinute();', 'const BAD = undefined;', /lossless JSON/],
  ] as const)("rejects invalid composed schedules: %s", async (body, prelude, message) => {
    const fixture = await scheduleCase(body, prelude);
    expect(fixture.run).toThrowError(expect.objectContaining({ code: "SCHEDULE_POLICY_INVALID", message: expect.stringMatching(message) }));
  });

  it("preserves imported mapping-key provenance through spreads and computed keys", async () => {
    const fixture = await policyCase('registry.controllers({ ...MAPPING });', 'import { MAPPING } from "./values.js";',
      'export const BAD = "../escape/**";\nexport const MAPPING = { [BAD]: "auth" };');
    expect(fixture.run).toThrowError(expect.objectContaining({ code: "MIDDLEWARE_CONTROLLER_PATTERN_INVALID",
      location: expect.objectContaining({ filePath: path.join(fixture.directory, "values.ts"), line: 1 }) }));
  });

  it("preserves imported middleware-reference provenance", async () => {
    const fixture = await policyCase('registry.group("web", REFERENCES); registry.use("web");', 'import { REFERENCES } from "./values.js";',
      'export const REFERENCES = ["missing"];');
    expect(fixture.run).toThrowError(expect.objectContaining({ code: "MIDDLEWARE_POLICY_INVALID",
      location: expect.objectContaining({ filePath: path.join(fixture.directory, "values.ts") }) }));
  });

  it.each([
    ['schedule.task(Cleanup).hourlyAt(VALUE);', 'export const VALUE = 60;'],
    ['schedule.task(Cleanup).cron(VALUE).id(ID);', 'export const VALUE = "invalid cron";\nexport const ID = "valid.id";'],
    ['schedule.task(Cleanup).everyMinute().timezone(VALUE);', 'export const VALUE = "Not/A_Zone";'],
    ['schedule.job(Report, "valid", VALUE as unknown as {limit: number}).everyMinute();', 'export const VALUE = undefined;'],
    ['schedule.task(Cleanup).everyMinute().id(VALUE); schedule.task(Cleanup).hourlyAt(1).id(VALUE);', 'export const VALUE = "duplicate.id";'],
  ] as const)("preserves imported adapter-validation origins: %s", async (body, imported) => {
    const fixture = await scheduleCase(body, 'import { VALUE, ' + (imported.includes("export const ID") ? 'ID' : 'VALUE as UNUSED') + ' } from "./values.js";', imported);
    expect(fixture.run).toThrowError(expect.objectContaining({ code: "SCHEDULE_POLICY_INVALID",
      location: expect.objectContaining({ filePath: path.join(fixture.directory, "values.ts"), line: 1 }) }));
  });

  it("counts policy attachments before deduplication at the exact declaration limit", async () => {
    const valid = await policyCase('registry.use(...REFS);', `const REFS = [${Array(10000).fill('"auth"').join(",")}];`);
    expect(valid.run().classes.find((entry) => entry.name === "Panel")!.methods[0]!.middleware[0]!.target.symbolName).toBe("Auth");
    const invalid = await policyCase('registry.use(...REFS);', `const REFS = [${Array(10001).fill('"auth"').join(",")}];`);
    expect(invalid.run).toThrow(/declaration budget \(10000\)/);
  });

  it("bounds cached group amplification before allocating unbounded intermediate output", async () => {
    const declarations = ['registry.group("g0", ["auth"]);'];
    for (let n = 1; n <= 18; n++) declarations.push(`registry.group("g${n}", ["g${n - 1}", "g${n - 1}"]);`);
    const fixture = await policyCase(declarations.join("\n"));
    expect(fixture.run).toThrow(/evaluated node budget \(100000\).*policy expansion path/s);
  });

  it.each([false, true])("bounds deep groups regardless of cache/declaration order (reverse=%s)", async (reverse) => {
    const declarations = ['registry.group("g0", ["auth"]);'];
    for (let n = 1; n <= 70; n++) declarations.push(`registry.group("g${n}", ["g${n - 1}"]);`);
    const fixture = await policyCase((reverse ? declarations.reverse() : declarations).join("\n"));
    expect(fixture.run).toThrow(/depth budget \(64\)/);
  });

  it("locates opaque validation failures from an unrelated schedule adapter without platform branches", async () => {
    const directory = await temporary(); const target = path.join(directory, "unrelated.ts");
    await writeFile(path.join(directory, "values.ts"), 'export const VALUE = "adapter.invalid";');
    await writeFile(target, 'import { Controller, defineApp } from "@bunwire/core"; import { Handle } from "proof-static"; import { VALUE } from "./values.js"; @Controller() export class Task { @Handle({ name: "task" }) handle() {} } export default defineApp().withSchedule((schedule) => { schedule.task(Task).dailyAt(VALUE); });');
    const extensions = aggregateCompilerExtensions(defineAdapterCompilerDescriptor({ id: "policy.unrelated", methodKinds: [METHOD_KIND], methodDecorators: [Handle.definition],
      metadataHandlers: [defineCompilerMetadataHandler({ id: "policy.unrelated.schedule", data: {
        type: "bunwire.application-schedule", jobClassKindIds: [], taskClassKindIds: [CONTROLLER_KIND.id],
        decorated: () => undefined,
        compile: (input) => { throw new Error("Unrelated adapter validation", { cause: { value: input.calls[0], index: 0 } }); },
      } satisfies ApplicationScheduleCompilationHandlerData })] }));
    expect(() => analyzeBunwireProgram({ projectRoot: root, sourceFiles: [target], bootstrapPath: target, extensions, compilerOptions: { baseUrl: root, paths } }))
      .toThrowError(expect.objectContaining({ code: "SCHEDULE_POLICY_INVALID", message: expect.stringContaining("Unrelated adapter validation"),
        location: expect.objectContaining({ filePath: path.join(directory, "values.ts"), line: 1 }) }));
  });
});
