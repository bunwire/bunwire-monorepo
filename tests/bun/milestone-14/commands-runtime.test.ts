import { afterEach, describe, expect, it } from "vitest";
import { createToken, defineApp, defineManagedMethodPlan, defineRuntimeRegistry, getManagedClassMetadata, type Application } from "@bunwire/core";
import { Argument, BUN_COMMAND_CONTEXT, BUN_COMMAND_HANDLE_KIND, BUN_COMMAND_KIND, BUN_COMMAND_RUNTIME, BunAdapter, Command, Flag, Option, type BunCommandContext, type BunCommandIO } from "@bunwire/bun";

const apps: Application[] = []; afterEach(async () => { await Promise.allSettled(apps.splice(0).map((app) => app.stop())); });
function io() { const stdout: string[] = []; const stderr: string[] = []; const value: BunCommandIO = { stdout: (line) => { stdout.push(line); }, stderr: (line) => { stderr.push(line); } }; return { value, stdout, stderr }; }
function commandRegistry(target: new (...args: any[]) => { handle(...args: any[]): unknown }, parameters: Parameters<typeof defineManagedMethodPlan>[0]["parameters"] = [], dependencies: { index: number; token: any }[] = []) {
  return defineRuntimeRegistry({ classes: [{ target, kind: BUN_COMMAND_KIND, scope: "transient", dependencies, data: getManagedClassMetadata(target)!.data }], methods: [defineManagedMethodPlan({ target, kind: BUN_COMMAND_HANDLE_KIND, ownerKind: BUN_COMMAND_KIND, method: "handle", data: undefined, parameters })] });
}
async function start(registry: ReturnType<typeof defineRuntimeRegistry>, options: ConstructorParameters<typeof BunAdapter>[0] = { role: "command", handleSignals: false }) { const app = defineApp().withAdapter(new BunAdapter(options)).withRuntimeRegistry(registry); apps.push(app); await app.start(); return app; }

describe("Bun command runtime", () => {
  it("parses generated arguments, options and flags and invokes inside a disposed command scope", async () => {
    const calls: unknown[][] = []; let context!: BunCommandContext;
    @Command({ name: "greet", description: "Greet a team." }) class Greet { constructor(value: BunCommandContext) { context = value; } handle(name: string, count: number, force: boolean): number { calls.push([name, count, force]); return 7; } }
    const parameters = [
      { source: "resolver" as const, methodIndex: 0, resolverId: Argument.definition.resolverId, data: Argument.definition.createMetadata({ name: "name", choices: ["Ada", "Grace"] }) },
      { source: "resolver" as const, methodIndex: 1, resolverId: Option.definition.resolverId, data: Option.definition.createMetadata({ name: "count", alias: "c", type: "integer", default: 2 }) },
      { source: "resolver" as const, methodIndex: 2, resolverId: Flag.definition.resolverId, data: Flag.definition.createMetadata({ name: "force", alias: "f" }) },
    ];
    const app = await start(commandRegistry(Greet, parameters, [{ index: 0, token: BUN_COMMAND_CONTEXT }])); const output = io();
    await expect(app.rootContainer.get(BUN_COMMAND_RUNTIME).run(["greet", "Ada", "-c", "3", "--force"], output.value)).resolves.toBe(7);
    expect(calls).toEqual([["Ada", 3, true]]); expect(context.arguments).toEqual({ name: "Ada" }); expect(context.options).toEqual({ count: 3, force: true }); expect(Object.isFrozen(context)).toBe(true); expect(context.scope.state).toBe("disposed");
  });
  it("renders help and deterministic usage failures with explicit codes", async () => {
    @Command("greet") class Greet { handle(_name: string): void {} }
    const parameters = [{ source: "resolver" as const, methodIndex: 0, resolverId: Argument.definition.resolverId, data: Argument.definition.createMetadata("name") }];
    const helpApp = await start(commandRegistry(Greet, parameters)); const help = io(); expect(await helpApp.rootContainer.get(BUN_COMMAND_RUNTIME).run(["greet", "--help"], help.value)).toBe(0); expect(help.stdout.join("\n")).toContain("Usage: bunwire greet <name>");
    const invalidApp = await start(commandRegistry(Greet, parameters)); const invalid = io(); expect(await invalidApp.rootContainer.get(BUN_COMMAND_RUNTIME).run(["greet"], invalid.value)).toBe(2); expect(invalid.stderr.join("\n")).toContain("Missing required argument");
    const unknownApp = await start(commandRegistry(Greet, parameters)); const unknown = io(); expect(await unknownApp.rootContainer.get(BUN_COMMAND_RUNTIME).run(["missing"], unknown.value)).toBe(2);
  });
  it("rejects malformed handler results and allows command configuration for on-demand hosts", async () => {
    @Command("bad") class Bad { handle(): number { return 300; } }
    const app = await start(commandRegistry(Bad), { role: "command", handleSignals: false, http: { port: 0 }, scheduler: {}, queues: { driver: { capabilities: { delay: true, reservations: true, renewal: true }, initialize() {}, push() {}, reserve() { return undefined; }, acknowledge() {}, release() {}, renew(value: any) { return value; }, fail() {}, close() {} }, worker: {} } });
    const output = io(); expect(await app.rootContainer.get(BUN_COMMAND_RUNTIME).run(["bad"], output.value)).toBe(1); expect(output.stderr.join("\n")).toContain("0 through 255");
    expect(() => new BunAdapter({ role: "worker", http: {} })).toThrow(/http or command/); expect(() => new BunAdapter({ role: "http", scheduler: {} })).toThrow(/scheduler or command/);
  });
  it("reports command-scope cleanup failures before returning", async () => {
    const RESOURCE = createToken<object>("test.command-resource");
    @Command("cleanup") class Cleanup { constructor(private readonly context: BunCommandContext) {} handle(): void { this.context.scope.scoped(RESOURCE, () => ({}), { dispose() { throw new Error("cleanup failed"); } }); this.context.scope.resolve(RESOURCE); } }
    const app = await start(commandRegistry(Cleanup, [], [{ index: 0, token: BUN_COMMAND_CONTEXT }])); const result = io();
    expect(await app.rootContainer.get(BUN_COMMAND_RUNTIME).run(["cleanup"], result.value)).toBe(1); expect(result.stderr.join("\n")).toContain("cleanup failed");
  });
});
