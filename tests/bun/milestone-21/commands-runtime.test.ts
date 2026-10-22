import { afterEach, describe, expect, it } from "vitest";
import { defineApp, defineManagedMethodPlan, defineRuntimeRegistry, getManagedClassMetadata, type Application } from "@bunwire/core";
import {
  Argument, BUN_COMMAND_CONTEXT, BUN_COMMAND_HANDLE_KIND, BUN_COMMAND_KIND, BUN_COMMAND_RUNTIME,
  BunAdapter, Command, Flag, Option, runBunCli, type BunCommandContext, type BunCommandIO,
} from "@bunwire/bun";

const apps: Application[] = [];
afterEach(async () => { await Promise.allSettled(apps.splice(0).map((app) => app.stop())); });

function capture(overrides: Partial<BunCommandIO> = {}) {
  const stdout: string[] = []; const stderr: string[] = [];
  const io: BunCommandIO = { stdout: (line) => { stdout.push(line); }, stderr: (line) => { stderr.push(line); }, ...overrides };
  return { io, stdout, stderr };
}

function registry(target: new (...args: any[]) => { handle(...args: any[]): unknown }, parameters: Parameters<typeof defineManagedMethodPlan>[0]["parameters"] = []) {
  return defineRuntimeRegistry({ classes: [{ target, kind: BUN_COMMAND_KIND, scope: "transient",
    dependencies: [{ index: 0, token: BUN_COMMAND_CONTEXT }], data: getManagedClassMetadata(target)!.data }],
    methods: [defineManagedMethodPlan({ target, kind: BUN_COMMAND_HANDLE_KIND, ownerKind: BUN_COMMAND_KIND,
      method: "handle", data: undefined, parameters })] });
}

async function start(value: ReturnType<typeof registry>) {
  const app = defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false })).withRuntimeRegistry(value);
  apps.push(app); await app.start(); return app;
}

describe("Bun Milestone 21 — command UX", () => {
  it("renders complete global and command help from registry metadata", async () => {
    @Command({ name: "reports:build", description: "Build a report.", examples: ["bunwire reports:build staff --format csv"] })
    class Build { constructor(_context: BunCommandContext) {} handle(_team: string, _format: string, _verbose: boolean): void {} }
    const parameters = [
      { source: "resolver" as const, methodIndex: 0, resolverId: Argument.definition.resolverId, data: Argument.definition.createMetadata({ name: "team", choices: ["staff", "guests"], description: "Team name." }) },
      { source: "resolver" as const, methodIndex: 1, resolverId: Option.definition.resolverId, data: Option.definition.createMetadata({ name: "format", alias: "f", default: "json", choices: ["json", "csv"] }) },
      { source: "resolver" as const, methodIndex: 2, resolverId: Flag.definition.resolverId, data: Flag.definition.createMetadata({ name: "verbose", alias: "v" }) },
    ];
    const app = await start(registry(Build, parameters)); const output = capture();
    expect(await app.rootContainer.get(BUN_COMMAND_RUNTIME).run(["help", "reports:build"], output.io)).toBe(0);
    expect(output.stdout.join("\n")).toContain("team  string; required; choices: staff, guests");
    expect(output.stdout.join("\n")).toContain("-f, --format  string; optional; default: json; choices: json, csv");
    expect(output.stdout.join("\n")).toContain("-v, --verbose  flag");
    expect(output.stdout.join("\n")).toContain("bunwire reports:build staff --format csv");
    const listApp = await start(registry(Build, parameters)); const list = capture();
    expect(await listApp.rootContainer.get(BUN_COMMAND_RUNTIME).run(["list"], list.io)).toBe(0);
    expect(list.stdout.join("\n")).toContain("reports:build  Build a report.");
    expect(list.stdout.join("\n")).toContain("queue:retry  Retry a failed job.");
  });

  it("provides stable table, progress and status output through context.io", async () => {
    @Command("display") class Display { constructor(private readonly context: BunCommandContext) {}
      async handle() {
        await this.context.io.table(["Name", "Count"], [["Alice", "2"], ["Bob\nSmith", "10"]]);
        await this.context.io.progress("Records", 2, 4);
        await this.context.io.status("success", "Done");
        await this.context.io.status("error", "Partial failure");
      } }
    const app = await start(registry(Display)); const output = capture();
    expect(await app.rootContainer.get(BUN_COMMAND_RUNTIME).run(["display"], output.io)).toBe(0);
    expect(output.stdout.join("\n")).toContain("Name       | Count");
    expect(output.stdout.join("\n")).toContain("Bob\\nSmith");
    expect(output.stdout).toContain("Progress: Records 2/4 (50%)");
    expect(output.stdout).toContain("SUCCESS: Done");
    expect(output.stderr).toContain("ERROR: Partial failure");
  });

  it("prompts only on explicit handler request and uses injected interactive I/O", async () => {
    let answered: string | undefined; let asked = 0;
    @Command("ask") class Ask { constructor(private readonly context: BunCommandContext) {}
      async handle() { answered = await this.context.io.prompt({ message: "Name?" }); } }
    const app = await start(registry(Ask)); const output = capture({ interactive: true, input: async (message) => { asked++; expect(message).toBe("Name?"); return "Ada"; } });
    expect(await app.rootContainer.get(BUN_COMMAND_RUNTIME).run(["ask"], output.io)).toBe(0);
    expect(answered).toBe("Ada"); expect(asked).toBe(1);
  });

  it("never waits on noninteractive input and preserves usage and cleanup exit codes", async () => {
    @Command("ask") class Ask { constructor(private readonly context: BunCommandContext) {}
      async handle() { await this.context.io.prompt({ message: "Name?" }); } }
    let touched = false;
    const output = capture({ interactive: false, input: () => { touched = true; return "unexpected"; } });
    const app = defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false }));
    expect(await runBunCli(app, registry(Ask), { argv: ["ask"], io: output.io })).toBe(2);
    expect(output.stderr.join("\n")).toContain("Interactive input is unavailable");
    expect(touched).toBe(false);
    expect(app.state).toBe("stopped");

    let fallback: string | undefined;
    @Command("fallback") class Fallback { constructor(private readonly context: BunCommandContext) {}
      async handle() { fallback = await this.context.io.prompt({ message: "Name?", nonInteractiveValue: "batch" }); } }
    const fallbackApp = await start(registry(Fallback));
    expect(await fallbackApp.rootContainer.get(BUN_COMMAND_RUNTIME).run(["fallback"], capture().io)).toBe(0);
    expect(fallback).toBe("batch");
  });

  it("keeps --help after -- as a positional value and reports parser usage errors", async () => {
    let received: string | undefined;
    @Command("literal") class Literal { constructor(_context: BunCommandContext) {} handle(value: string) { received = value; } }
    const parameters = [{ source: "resolver" as const, methodIndex: 0, resolverId: Argument.definition.resolverId,
      data: Argument.definition.createMetadata("value") }];
    const app = await start(registry(Literal, parameters));
    expect(await app.rootContainer.get(BUN_COMMAND_RUNTIME).run(["literal", "--", "--help"], capture().io)).toBe(0);
    expect(received).toBe("--help");
    const invalid = await start(registry(Literal, parameters)); const output = capture();
    expect(await invalid.rootContainer.get(BUN_COMMAND_RUNTIME).run(["literal", "--bad"], output.io)).toBe(2);
    expect(output.stderr.join("\n")).toContain('Run "bunwire help literal" for usage.');
    let optionValue: string | undefined;
    @Command("option-value") class OptionValue { constructor(_context: BunCommandContext) {} handle(value: string) { optionValue = value; } }
    const option = [{ source: "resolver" as const, methodIndex: 0, resolverId: Option.definition.resolverId,
      data: Option.definition.createMetadata({ name: "text" }) }];
    const optionApp = await start(registry(OptionValue, option));
    expect(await optionApp.rootContainer.get(BUN_COMMAND_RUNTIME).run(["option-value", "--text", "--help"], capture().io)).toBe(0);
    expect(optionValue).toBe("--help");
  });
});
