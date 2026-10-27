import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runBunwireCli } from "@bunwire/cli";
import { BUNWIRE_INSPECTION_COMMANDS, inspectBunwireApplication } from "@bunwire/vite/compiler";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const electrobunRoot = path.join(repositoryRoot, "tests/fixtures/milestone-12-electrobun");
const bunRoot = path.join(repositoryRoot, "examples/bun-app");
const commandRoot = path.join(repositoryRoot, "examples/bun-app/command");
const scheduleRoot = path.join(repositoryRoot, "examples/bun-app/scheduler");
const temporary: string[] = [];

async function copyFixture(source: string): Promise<string> {
  const destination = await fs.mkdtemp(path.join(repositoryRoot, ".tmp-bunwire-m25-"));
  temporary.push(destination);
  await fs.cp(source, destination, { recursive: true, filter: (entry) => !path.basename(entry).startsWith(".bunwire") });
  return destination;
}

async function run(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runBunwireCli(args, { cwd, io: { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) } });
  return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

afterEach(async () => {
  for (const target of temporary.splice(0)) {
    if (path.dirname(target) !== repositoryRoot || !path.basename(target).startsWith(".tmp-bunwire-m25-")) {
      throw new Error("Unsafe inspection fixture cleanup target.");
    }
    await fs.rm(target, { recursive: true, force: true });
  }
});

describe.sequential("Milestone 25 — compiler-backed project inspection", () => {
  it("lists Electrobun and Core records through all ten commands without writing artifacts", async () => {
    const root = await copyFixture(electrobunRoot);
    await fs.writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { experimentalDecorators: true } }));
    const application = path.join(root, "src/bun/application.ts");
    await fs.appendFile(application, '\nthrow new Error("Inspection executed application source");\n');
    const inspection = await inspectBunwireApplication({ root });
    expect(inspection.schemaVersion).toBe(1);
    expect(inspection.items["routes:list"].some((entry) => entry.details.transport === "electrobun-request" && entry.details.path === "users/get")).toBe(true);
    expect(inspection.items["routes:list"].some((entry) => entry.details.transport === "electrobun-message")).toBe(true);
    for (const command of ["providers:list", "controllers:list", "services:list", "middleware:list"] as const) {
      expect(inspection.items[command].length, command).toBeGreaterThan(0);
    }
    for (const command of BUNWIRE_INSPECTION_COMMANDS) {
      const result = await run([command, "--root", root, "--json"], repositoryRoot);
      expect(result.code, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ schemaVersion: 1, command, root, items: inspection.items[command] });
      expect(inspection.items[command].map((entry) => entry.identity)).toEqual(
        [...inspection.items[command].map((entry) => entry.identity)].sort(),
      );
    }
    const defaultRoot = await run(["services:list"], root);
    expect(defaultRoot.code, defaultRoot.stderr).toBe(0);
    expect(defaultRoot.stdout).toContain("UserService");
    expect(await fs.stat(path.join(root, ".bunwire")).then(() => true, () => false)).toBe(false);
  }, 180_000);

  it("reports Bun routes, jobs, schedules, events, listener delivery, and command definitions", async () => {
    const inspection = await inspectBunwireApplication({ root: bunRoot });
    expect(inspection.items["routes:list"].some((entry) => entry.details.method === "GET" && entry.details.path === "/api")).toBe(true);
    expect(inspection.items["jobs:list"].some((entry) => entry.details.id === "example.record-action")).toBe(true);
    const schedules = await inspectBunwireApplication({ root: scheduleRoot });
    expect(schedules.items["schedule:list"].length).toBeGreaterThan(0);
    expect(inspection.items["events:list"].length).toBeGreaterThan(0);
    const deliveries = inspection.items["listeners:list"].map((entry) => entry.details.delivery);
    expect(deliveries).toContain("queued");
    expect(deliveries).toContain("direct");
    expect(inspection.items["events:list"].some((entry) => entry.related.length > 0)).toBe(true);
    const middleware = inspection.items["middleware:list"];
    expect(new Set(middleware.map((entry) => entry.name)).size).toBe(middleware.length);
    expect(middleware.some((entry) => entry.related.length > 0)).toBe(true);
    expect(middleware.some((entry) => entry.identity === "core.middleware:@bunwire/bun#CsrfMiddleware")).toBe(true);
    const commands = await inspectBunwireApplication({ root: commandRoot });
    expect(commands.items["commands:list"].some((entry) => entry.details.name === "greet")).toBe(true);
  }, 180_000);

  it("uses stable identities for import aliases and duplicate display names", async () => {
    const root = await copyFixture(electrobunRoot);
    const one = path.join(root, "src/bun/duplicate-a.ts");
    const two = path.join(root, "src/bun/duplicate-b.ts");
    await fs.writeFile(one, 'import { Service as Managed } from "@bunwire/core";\n@Managed() export class SameName {}\n');
    await fs.writeFile(two, 'import { Service } from "@bunwire/core";\n@Service() export class SameName {}\n');
    const inspection = await inspectBunwireApplication({ root });
    const duplicates = inspection.items["services:list"].filter((entry) => entry.name === "SameName");
    expect(duplicates).toHaveLength(2);
    expect(new Set(duplicates.map((entry) => entry.identity)).size).toBe(2);
    expect(duplicates.map((entry) => entry.identity)).toEqual([...duplicates.map((entry) => entry.identity)].sort());
  }, 90_000);

  it("includes statically configured Providers outside managed roots and reports empty lists", async () => {
    const root = await copyFixture(electrobunRoot);
    await fs.mkdir(path.join(root, "shared"));
    await fs.writeFile(path.join(root, "shared/external-provider.ts"),
      'export class ExternalProvider { register(): void { throw new Error("Provider lifecycle executed during inspection"); } }\n');
    const bootstrap = path.join(root, "src/bun/bootstrap.ts");
    await fs.writeFile(bootstrap, 'import { ExternalProvider as ConfiguredProvider } from "../../shared/external-provider.js";\n'
      + (await fs.readFile(bootstrap, "utf8")).replace('}));', '})).withProviders(ConfiguredProvider);'));
    const inspection = await inspectBunwireApplication({ root });
    expect(inspection.items["providers:list"].some((entry) => entry.name === "ExternalProvider"
      && entry.details.registration === "explicit" && entry.location?.file === "shared/external-provider.ts")).toBe(true);
    const commandInspection = await inspectBunwireApplication({ root: commandRoot });
    expect(commandInspection.items["events:list"]).toEqual([]);
    const empty = await run(["events:list", "--json", "--root", commandRoot], repositoryRoot);
    expect(empty.code, empty.stderr).toBe(0);
    expect(JSON.parse(empty.stdout).items).toEqual([]);
    const human = await run(["events:list", "--root", commandRoot], repositoryRoot);
    expect(human.stdout).toBe("NAME\tKIND\tDETAILS\tRELATED\tSOURCE");
  }, 90_000);

  it("accepts a generic adapter inspection contribution without a concrete-adapter branch", async () => {
    const root = await copyFixture(path.join(repositoryRoot, "tests/fixtures/milestone-7-discovery"));
    await fs.writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { allowJs: true, experimentalDecorators: true } }));
    const adapter = path.join(root, "adapter/fake-adapter.mjs");
    const source = await fs.readFile(adapter, "utf8");
    await fs.writeFile(adapter, source.replace(
      'Object.freeze({ id: "fixture.topic-metadata", data: Object.freeze({ type: "topic" }) }),',
      'Object.freeze({ id: "fixture.topic-metadata", data: Object.freeze({ type: "topic" }) }),\n'
      + '    Object.freeze({ id: "fixture.project-inspection", data: Object.freeze({ type: "bunwire.project-inspection", '
      + 'classes: [{ kindId: "fixture.consumer", command: "controllers:list", describe: () => ({ family: "fixture" }) }], '
      + 'methods: [{ kindId: "fixture.subscribe", command: "routes:list", describe: () => ({ transport: "fixture", topic: "created" }) }] }) }),',
    ));
    await fs.writeFile(path.join(root, "src/bun/consumer.ts"),
      'import { Consumer, Subscribe } from "../../adapter/fake-adapter.mjs";\n'
      + '@Consumer() export class FixtureConsumer { @Subscribe() handle(): void {} }\n');
    const inspection = await inspectBunwireApplication({ root });
    expect(inspection.items["controllers:list"].some((entry) => entry.kindId === "fixture.consumer" && entry.details.family === "fixture")).toBe(true);
    expect(inspection.items["routes:list"].some((entry) => entry.kindId === "fixture.subscribe" && entry.details.topic === "created")).toBe(true);
  }, 90_000);

  it("agrees with Bun runtime list commands on shared route, job, and event fields", async () => {
    const inspection = await inspectBunwireApplication({ root: bunRoot });
    const runtime = (command: string): string[] => {
      const result = spawnSync("bun", ["inspect.ts", command], { cwd: bunRoot, encoding: "utf8", timeout: 90_000 });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim().split(/\r?\n/).filter(Boolean);
    };
    const routes = new Set(runtime("routes:list"));
    for (const entry of inspection.items["routes:list"]) {
      expect(routes.has(`${entry.details.method}\t${entry.details.path}\t${entry.name}`), entry.identity).toBe(true);
    }
    const jobs = new Set(runtime("jobs:list"));
    for (const entry of inspection.items["jobs:list"]) {
      const expected = `${entry.details.id}\t${entry.details.queue}\ttries=${entry.details.tries}`
        + (entry.details.timeout === undefined ? "" : `\ttimeout=${entry.details.timeout}`);
      expect(jobs.has(expected), entry.identity).toBe(true);
    }
    const listeners = new Map(inspection.items["listeners:list"].map((entry) => [entry.identity, entry]));
    const events = new Map(runtime("events:list").map((line) => {
      const [alias, name, listeners] = line.split("\t");
      return [`${alias}\t${name}`, (listeners ?? "").split(",").filter(Boolean).sort()];
    }));
    for (const entry of inspection.items["events:list"]) {
      const related = entry.related.map((identity) => listeners.get(identity)!)
        .map((listener) => `${listener.name}:${listener.details.delivery}`).sort();
      expect(events.get(`${entry.details.alias ?? entry.name}\t${entry.name}`), entry.identity).toEqual(related);
    }
  }, 180_000);

  it("agrees with Bun runtime schedule listing on compiled fields", async () => {
    const inspection = await inspectBunwireApplication({ root: scheduleRoot });
    const temporaryRoot = await fs.mkdtemp(path.join(repositoryRoot, ".tmp-bunwire-m25-"));
    temporary.push(temporaryRoot);
    const script = path.join(temporaryRoot, "runtime-schedules.ts");
    await fs.writeFile(script, 'import { BunAdapter, SyncQueueDriver, runBunCli } from "@bunwire/bun";\n'
      + 'import { defineApp } from "@bunwire/core";\n'
      + 'import registry from "../examples/bun-app/scheduler/.bunwire/registry.ts";\n'
      + 'process.exitCode = await runBunCli(defineApp().withAdapter(new BunAdapter({ role: "command", queues: { driver: new SyncQueueDriver() } })), registry, { argv: ["schedule:list"] });\n');
    const result = spawnSync("bun", [script], { cwd: repositoryRoot, encoding: "utf8", timeout: 90_000 });
    expect(result.status, result.stderr).toBe(0);
    const runtime = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    for (const entry of inspection.items["schedule:list"]) {
      const expected = `${entry.details.id}\t${entry.details.cron}\t${entry.details.timezone ?? "UTC"}\t${entry.details.execution}`
        + `\t${entry.related[0]?.split("#").at(-1)}\t${entry.details.overlap}`;
      expect(runtime, entry.identity).toContain(expected);
    }
  }, 120_000);

  it("reports compiler errors on stderr with nonzero status and no JSON success output", async () => {
    const root = await copyFixture(electrobunRoot);
    const config = path.join(root, "bunwire.config.ts");
    await fs.writeFile(config, (await fs.readFile(config, "utf8")).replace("./src/bun", "./missing"));
    const result = await run(["services:list", "--json", "--root", root], repositoryRoot);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("SOURCE_ROOT_NOT_FOUND");
    expect(result.stdout).toBe("");
    const invalidFlag = await run(["generate", "--json"], root);
    expect(invalidFlag.code).toBe(1);
    expect(invalidFlag.stderr).toContain("--json is available only for inspection commands");
  });
});
