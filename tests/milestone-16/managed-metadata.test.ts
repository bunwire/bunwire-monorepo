import { access, mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";
import { defineApp, type RuntimeRegistry } from "@bunwire/core";
import { BunAdapter } from "@bunwire/bun";
import { ElectrobunAdapter, ManualElectrobunAdapter, defineElectrobunContext } from "@bunwire/electrobun";
import { aggregateCompilerExtensions, analyzeBunwireProgram, generateRuntimeRegistryModule, generateCallerContractModule, generateBunwireArtifacts } from "@bunwire/vite";
import { compiler, StaticAdapter, type Host } from "../fixtures/milestone-16-static-metadata/adapter.js";
import { CACHE } from "../fixtures/milestone-16-static-metadata/fake.js";
import { BrowserView, BrowserWindow } from "../fixtures/milestone-11-electrobun/fake-native.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = path.join(root, "tests/fixtures/milestone-16-static-metadata");
const directories: string[] = [];
const paths = { "@bunwire/core": ["packages/core/src/index.ts"], "@bunwire/bun": ["packages/bun/src/index.ts"],
  "@bunwire/electrobun": ["packages/electrobun/src/index.ts"], "proof-static": ["tests/fixtures/milestone-16-static-metadata/adapter.ts"] };
const fakeExtensions = aggregateCompilerExtensions(compiler);
function analyze(file: string, extensions = fakeExtensions) {
  return analyzeBunwireProgram({ projectRoot: root, sourceFiles: [path.resolve(fixture, file)], extensions,
    compilerOptions: { baseUrl: root, paths } });
}
async function temporary() { const directory = await mkdtemp(path.join(fixture, ".generated-")); directories.push(directory); return directory; }
afterAll(async () => { for (const directory of directories) {
  if (path.dirname(directory) !== fixture || !path.basename(directory).startsWith(".generated-")) throw new Error("Unexpected cleanup path");
  await rm(directory, { recursive: true, force: true });
} });

describe("Milestone 16 — managed static metadata", () => {
  it("resolves imported protected fields, decorator/injector options, aliases, attachments and DI independently", () => {
    const result = analyze("fake.ts");
    const action = result.classes.find((entry) => entry.name === "Actions")!;
    expect(action.attachments?.[0]?.data).toEqual({ id: "static.tag" });
    expect(action.methods[0]?.data).toEqual({ name: "execute" });
    expect(action.methods[0]?.parameters.map((entry) => entry.source)).toEqual(["transport", "container", "transport", "container", "resolver"]);
    expect(action.methods[0]?.parameters.filter((entry) => entry.source === "transport").map((entry) => entry.argumentIndex)).toEqual([0, 1]);
    expect(action.methods[0]?.parameters[4]).toMatchObject({ source: "resolver", data: { key: "framework" } });
    expect(action.methods[0]?.middleware[0]?.parameters).toEqual(["strict"]);
    expect(result.classes.find((entry) => entry.name === "Created")?.event?.alias).toBe("static.created");
    expect(result.classes.find((entry) => entry.name === "Audit")?.data).toMatchObject({ alias: "audit", include: ["/**", "/static/**"] });
  });

  it("executes generated fake-adapter plans with actual runtime decorator metadata agreement", async () => {
    const directory = await temporary(); const analysis = analyze("fake.ts");
    const generated = generateRuntimeRegistryModule({ analysis, extensions: fakeExtensions, modulePath: path.join(directory, "registry.ts") });
    await writeFile(path.join(directory, "registry.ts"), generated.code);
    const { applicationRegistry } = await import(pathToFileURL(path.join(directory, "registry.ts")).href) as { applicationRegistry: RuntimeRegistry };
    const context: Host = { handlers: new Map() };
    const app = defineApp().withContext(context).withAdapter(new StaticAdapter()).withRuntimeRegistry(applicationRegistry);
    await app.start();
    app.rootContainer.value(CACHE, "cache");
    try { await expect(context.handlers.get("execute")!(["id", "suffix"])).resolves.toEqual({ id: "id", suffix: "suffix", user: "users", cache: "cache", framework: "framework" }); }
    finally { await app.stop(); }
  });

  it("compiles the exact imported Bun job policy and emits no job caller contract", () => {
    const extensions = aggregateCompilerExtensions(BunAdapter.compiler);
    const analysis = analyze("bun/src/jobs.ts", extensions);
    expect(analysis.classes.find((entry) => entry.name === "ChargeCardJob")?.data).toEqual({ id: "billing.charge", queue: "critical-billing", tries: 1, timeout: 60000, backoff: [1000, 5000, 30000] });
    expect(generateCallerContractModule({ analysis, extensions, modulePath: path.join(fixture, "client.ts") }).code).not.toContain("billing.charge");
  });

  it("generates byte-identical records/imports/plans for equivalent literal and expression metadata", async () => {
    const directory = await temporary(); const target = path.join(directory, "equivalent.ts");
    const expression = 'import { Controller } from "@bunwire/core"; import { Handle, Tag, Framework } from "proof-static"; import { METHOD_OPTIONS, ATTACHMENT_OPTIONS, INJECTOR_OPTIONS } from "../options.js"; @Controller("same") @Tag(ATTACHMENT_OPTIONS) export class Same { @Handle(METHOD_OPTIONS) run(id: string, @Framework(INJECTOR_OPTIONS) value: string) { return id + value; } }';
    await writeFile(target, expression);
    const first = generateRuntimeRegistryModule({ analysis: analyze(target), extensions: fakeExtensions, modulePath: path.join(directory, "registry.ts") });
    await writeFile(target, expression.replace("@Tag(ATTACHMENT_OPTIONS)", '@Tag({ id: "static.tag" })').replace("@Handle(METHOD_OPTIONS)", '@Handle({ name: "execute" })').replace("@Framework(INJECTOR_OPTIONS)", '@Framework({ key: "framework" })'));
    const second = generateRuntimeRegistryModule({ analysis: analyze(target), extensions: fakeExtensions, modulePath: path.join(directory, "registry.ts") });
    expect(second.code).toBe(first.code); expect(second.hash).toBe(first.hash);
  });

  it("compiles Electrobun expressions without exposing injected parameters to callers", () => {
    const extensions = aggregateCompilerExtensions(ElectrobunAdapter.compiler);
    const analysis = analyze("electrobun.ts", extensions);
    const request = analysis.classes.find((entry) => entry.name === "Requests")!;
    expect(request.data).toEqual({ prefix: "static" });
    expect(request.methods[0]?.parameters.map((entry) => entry.source)).toEqual(["transport", "container", "resolver"]);
    const client = generateCallerContractModule({ analysis, extensions, modulePath: path.join(fixture, "client.ts") }).code;
    expect(client).toContain('"static/get"'); expect(client).not.toContain("argument1");
  });

  it("executes generated Bun job policy in the real host", async () => {
    const directory = await temporary();
    const generated = await generateBunwireArtifacts({ root: path.join(fixture, "bun"),
      generatedModulePath: path.join(directory, "bun-registry.ts"), generatedClientModulePath: path.join(directory, "client.ts"), generatedDeclarationsPath: path.join(directory, "virtual.d.ts") });
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn("bun", [path.join(root, "tests/milestone-16/fixtures/job-child.ts"), generated.paths.registry], { cwd: root, stdio: "pipe" });
      let output = ""; const timeout = setTimeout(() => { child.kill(); reject(new Error(`Bun metadata process timeout: ${output}`)); }, 20000);
      child.stdout.on("data", (data) => { output += data.toString(); }); child.stderr.on("data", (data) => { output += data.toString(); });
      child.on("error", (error) => { clearTimeout(timeout); reject(error); });
      child.on("exit", (code) => { clearTimeout(timeout); code === 0 ? resolve(output) : reject(new Error(output)); });
    });
    expect(output).toContain("STATIC_JOB_OK");
  });

  it("executes expression-derived Electrobun middleware and request metadata through native RPC", async () => {
    const directory = await temporary(); const extensions = aggregateCompilerExtensions(ElectrobunAdapter.compiler);
    const analysis = analyze("electrobun.ts", extensions);
    const generated = generateRuntimeRegistryModule({ analysis, extensions, modulePath: path.join(directory, "electrobun.ts") });
    await writeFile(path.join(directory, "electrobun.ts"), generated.code);
    const { applicationRegistry } = await import(pathToFileURL(path.join(directory, "electrobun.ts")).href) as { applicationRegistry: RuntimeRegistry };
    const rpc = BrowserView.defineRPC({ handlers: { requests: {}, messages: {} } });
    const window = new BrowserWindow({ title: "Static metadata", rpc });
    const app = defineApp().withAdapter(new ManualElectrobunAdapter()).withContext(defineElectrobunContext(window)).withRuntimeRegistry(applicationRegistry);
    await app.start();
    try { await expect(rpc.receiveRequest("static/get", { args: ["id"] })).resolves.toBe("id:users:Static metadata"); }
    finally { await app.stop(); }
  });

  it.each([
    ['const options = { name: "" }; @Controller() export class Invalid { @Handle(options) run() {} }', "DECORATOR_ARGUMENT_INVALID", /method name/],
    ['const alias = "same"; @Middleware() export class One { protected alias = alias; handle() {} } @Middleware() export class Two { protected alias = alias; handle() {} }', "MIDDLEWARE_METADATA_INVALID", /unique/],
    ['const alias = "same"; @Event() export class One { protected alias = alias; } @Event() export class Two { protected alias = alias; }', "EVENT_ALIAS_INVALID", /unique/],
    ['const filters = ["/**", ""]; @Middleware() export class Invalid { protected include = filters; handle() {} }', "MIDDLEWARE_METADATA_INVALID", /non-empty/],
    ['const options = { name: "execute" }; const alias = options; alias.name = "changed"; @Controller() export class Invalid { @Handle(options) run() {} }', "DECORATOR_ARGUMENT_INVALID", /detected write/],
    ['const options = { name: "execute" }; unknownCall(options); declare function unknownCall(input: unknown): void; @Controller() export class Invalid { @Handle(options) run() {} }', "DECORATOR_ARGUMENT_INVALID", /mutating call|escape/],
    ['const filters = ["/**"]; @Middleware() export class Invalid { protected include = filters; handle() { this.include.push("/changed"); } }', "DECORATOR_ARGUMENT_INVALID", /mutating call/],
    ['const key = "include"; @Middleware() export class Invalid { protected include = ["/**"]; handle() { this[key].push("/changed"); } }', "DECORATOR_ARGUMENT_INVALID", /mutating call/],
    ['const options = { name: "execute" }; const Fake = Object.assign((_options: { name: string }): MethodDecorator => () => {}, { definition: Handle.definition }); @Controller() export class Invalid { @Fake(options) run() {} }', "DECORATOR_IDENTITY_CONFLICT", /canonical/],
    ['const options = { name: "execute" }; @Service() export class Invalid { @Handle(options) run() {} }', "MANAGED_METHOD_INVALID", /not allowed/],
    ['const BAD = "not-a-token"; @Controller() export class Invalid { @Handle({ name: "run" }) run(@Inject(BAD as any) value: string) {} }', "CONSTRUCTOR_INJECTION_INVALID", /token|runtime/],
    ['const options = { name: "execute" }; @Controller() export class Invalid { @Handle(makeOptions()) run() {} } function makeOptions() { return options; }', "DECORATOR_ARGUMENT_INVALID", /arbitrary calls/],
  ] as const)("rejects invalid resolved metadata: %s", async (source, code, message) => {
    const directory = await temporary(); const target = path.join(directory, "invalid.ts");
    await writeFile(target, 'import { Controller, Middleware, Event, Service, Inject } from "@bunwire/core"; import { Handle } from "proof-static"; ' + source);
    expect(() => analyze(target)).toThrowError(expect.objectContaining({ code, message: expect.stringMatching(message) }));
  });

  it("retains the imported invalid value's source location", async () => {
    const directory = await temporary();
    await writeFile(path.join(directory, "values.ts"), 'export const FILTERS = ["/**", ""];');
    await writeFile(path.join(directory, "invalid.ts"), 'import { Middleware } from "@bunwire/core"; import { FILTERS } from "./values.js"; @Middleware() export class Invalid { protected include = FILTERS; handle() {} }');
    expect(() => analyze(path.join(directory, "invalid.ts"))).toThrowError(expect.objectContaining({ code: "MIDDLEWARE_METADATA_INVALID",
      location: expect.objectContaining({ filePath: path.join(directory, "values.ts"), line: 1 }) }));
  });

  it("preserves special own keys and ordinary object APIs through generation and runtime loading", async () => {
    const directory = await temporary(); const target = path.join(directory, "special.ts");
    await writeFile(target, 'import { Controller } from "@bunwire/core"; import { Handle } from "proof-static"; const EXTRA = { ["__proto__"]: { marker: "safe" }, constructor: "own", toString: "own" }; const OPTIONS = { name: "safe", extra: EXTRA }; @Controller() export class Safe { @Handle(OPTIONS) run() {} }');
    const generated = generateRuntimeRegistryModule({ analysis: analyze(target), extensions: fakeExtensions, modulePath: path.join(directory, "registry.ts") });
    expect(generated.code).toContain('["__proto__"]:');
    await writeFile(path.join(directory, "registry.ts"), generated.code);
    const { applicationRegistry } = await import(pathToFileURL(path.join(directory, "registry.ts")).href) as { applicationRegistry: RuntimeRegistry };
    const extra = (applicationRegistry.methods[0]!.data as { extra: Record<string, unknown> }).extra;
    expect(Object.hasOwn(extra, "__proto__")).toBe(true);
    expect(extra["__proto__"]).toEqual({ marker: "safe" });
    expect(extra.constructor).toBe("own"); expect(extra.toString).toBe("own");
    expect(Object.getPrototypeOf(extra)).toBe(Object.prototype);
  });

  it("never executes imported module side effects or policy initializers while compiling metadata", async () => {
    const directory = await temporary(); const sentinel = path.join(directory, "executed");
    await writeFile(path.join(directory, "effects.ts"), `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(sentinel)}, "executed"); export const OPTIONS = { name: "static" }; throw new Error("Application executed");`);
    await writeFile(path.join(directory, "safe.ts"), 'import { Controller } from "@bunwire/core"; import { Handle } from "proof-static"; import { OPTIONS } from "./effects.js"; @Controller() export class Safe { @Handle(OPTIONS) run() {} }');
    expect(analyze(path.join(directory, "safe.ts")).classes[0]?.methods[0]?.data).toEqual({ name: "static" });
    await expect(access(sentinel)).rejects.toThrow();
  });

  it("typechecks expression-derived client calls while excluding injected arguments", async () => {
    const directory = await temporary(); const extensions = aggregateCompilerExtensions(ElectrobunAdapter.compiler);
    const analysis = analyze("electrobun.ts", extensions);
    const clientPath = path.join(directory, "client.ts");
    await writeFile(clientPath, generateCallerContractModule({ analysis, extensions, modulePath: clientPath }).code);
    const contract = path.join(directory, "contract.ts");
    await writeFile(contract, `import { createBunwireClient } from "./client.js";
const client = createBunwireClient({ request: async () => "result", send() {} });
const result: Promise<string> = client.request("static/get", "id");
// @ts-expect-error users and native window are injected, not caller arguments
client.request("static/get", "id", {}, {});
// @ts-expect-error caller id must be a string
client.request("static/get", 123);
// @ts-expect-error caller id is required
client.request("static/get");
void result;
`);
    const program = ts.createProgram([contract], { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext, experimentalDecorators: true, strict: true, noEmit: true,
      skipLibCheck: true, esModuleInterop: true, baseUrl: root, paths: { ...paths, "electrobun/bun": ["tests/fixtures/milestone-11-electrobun/fake-native.ts"] } });
    expect(ts.getPreEmitDiagnostics(program).map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))).toEqual([]);
  });

  it("resolves imported include/exclude/only/except arrays while retaining their distinct validation", async () => {
    const directory = await temporary();
    await writeFile(path.join(directory, "filters.ts"), 'export const INCLUDE = ["/static/**"]; export const EXCLUDE = ["/static/private/**"]; export const ONLY = ["GET"]; export const EXCEPT = ["POST"];');
    const target = path.join(directory, "filters-app.ts");
    await writeFile(target, 'import { Middleware } from "@bunwire/core"; import { INCLUDE, EXCLUDE, ONLY, EXCEPT } from "./filters.js"; @Middleware() export class Filtered { protected include = INCLUDE; protected exclude = [...EXCLUDE]; protected only = ONLY; handle() {} } @Middleware() export class Except { protected except = EXCEPT; handle() {} }');
    const result = analyze(target);
    expect(result.classes.find((entry) => entry.name === "Filtered")?.data).toMatchObject({ include: ["/static/**"], exclude: ["/static/private/**"], only: ["GET"] });
    expect(result.classes.find((entry) => entry.name === "Except")?.data).toMatchObject({ except: ["POST"] });
  });

  it("keeps Bun policy validation active for resolved arithmetic values", async () => {
    const directory = await temporary(); const target = path.join(directory, "invalid-job.ts");
    await writeFile(target, 'import { Job } from "@bunwire/bun"; const SECOND = 1000; @Job({ id: "invalid.timeout" }) export class Invalid { protected timeout = SECOND - 1000; handle() {} }');
    expect(() => analyze(target, aggregateCompilerExtensions(BunAdapter.compiler))).toThrow(/timeout.*safe integer/i);
  });
});
