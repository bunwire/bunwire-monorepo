import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runBunwireCli } from "@bunwire/cli";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = path.join(repositoryRoot, "tests/fixtures/milestone-12-electrobun");
const bunFixture = path.join(repositoryRoot, "examples/bun-app/command");

async function waitFor(check: () => Promise<boolean> | boolean, message: string, timeout = 90_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (await check()) return; } catch { /* Refresh may still be writing. */ }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

interface RunningWatch {
  readonly stdout: string[];
  readonly stderr: string[];
  readonly stop: () => Promise<number>;
}

function startWatch(root: string, explicitRoot = false): RunningWatch {
  const controller = new AbortController();
  const stdout: string[] = [];
  const stderr: string[] = [];
  const result = runBunwireCli(explicitRoot ? ["watch", "--root", root] : ["watch"], {
    cwd: explicitRoot ? repositoryRoot : root,
    signal: controller.signal,
    io: { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) },
  });
  return { stdout, stderr, stop: async () => { controller.abort(); return result; } };
}

describe.sequential("Milestone 24 — standalone watch lifecycle", () => {
  let root: string;
  let active: RunningWatch | undefined;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(repositoryRoot, ".tmp-bunwire-m24-"));
    await fs.cp(fixture, root, { recursive: true });
    await fs.writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { experimentalDecorators: true } }));
  });

  afterEach(async () => {
    await active?.stop();
    active = undefined;
    if (path.dirname(root) !== repositoryRoot || !path.basename(root).startsWith(".tmp-bunwire-m24-")) {
      throw new Error("Unsafe watch test cleanup target.");
    }
    await fs.rm(root, { recursive: true, force: true });
  });

  it("handles managed-root edits, additions, deletions, rapid changes, and generated output without a loop", async () => {
    active = startWatch(root, true);
    const client = path.join(root, ".bunwire/client.ts");
    const registry = path.join(root, ".bunwire/registry.ts");
    const source = path.join(root, "src/bun/application.ts");
    await waitFor(async () => (await fs.readFile(client, "utf8")).includes('"users/get"'), "Initial watch generation failed.");
    const original = await fs.readFile(source, "utf8");
    await fs.writeFile(source, original.replace('@Route("get")', '@Route("changed")'));
    await waitFor(async () => (await fs.readFile(client, "utf8")).includes('"users/changed"'), "Managed source edit was not compiled.");

    const added = path.join(root, "src/bun/added.ts");
    await fs.writeFile(added, 'import { Service } from "@bunwire/core";\n@Service() export class AddedService {}\n');
    await waitFor(async () => (await fs.readFile(registry, "utf8")).includes("AddedService"), "Managed source addition was not discovered.");
    await fs.unlink(added);
    await waitFor(async () => !(await fs.readFile(registry, "utf8")).includes("AddedService"), "Managed source deletion was not compiled.");

    await fs.writeFile(source, original.replace('@Route("get")', '@Route("first")'));
    await fs.writeFile(source, original.replace('@Route("get")', '@Route("second")'));
    await fs.writeFile(source, original.replace('@Route("get")', '@Route("final")'));
    await waitFor(async () => (await fs.readFile(client, "utf8")).includes('"users/final"'), "Rapid edits did not converge.");
    const successful = active.stdout.length;
    await fs.appendFile(registry, "\n// output edit must not trigger watch\n");
    await new Promise<void>((resolve) => setTimeout(resolve, 650));
    expect(active.stdout.length).toBe(successful);
    expect(await fs.readFile(registry, "utf8")).toContain("output edit must not trigger watch");
    expect(await active.stop()).toBe(0);
    active = undefined;
  });

  it("tracks imported helpers and re-exports outside source roots, then recovers missing imports", async () => {
    const shared = path.join(root, "shared");
    await fs.mkdir(shared);
    const valuesA = path.join(shared, "values-a.ts");
    const valuesB = path.join(shared, "values-b.ts");
    const barrel = path.join(shared, "barrel.ts");
    await fs.writeFile(valuesA, 'import { Service } from "@bunwire/core";\nexport const ROUTE = "getA";\n@Service() export class NotDiscovered {}\n');
    await fs.writeFile(valuesB, 'export const ROUTE = "getB";\n');
    await fs.writeFile(barrel, 'export { ROUTE } from "./values-a.js";\n');
    const source = path.join(root, "src/bun/application.ts");
    await fs.writeFile(source, 'import { ROUTE } from "../../shared/barrel.js";\n'
      + (await fs.readFile(source, "utf8")).replace('@Route("get")', '@Route(ROUTE)'));
    active = startWatch(root);
    const client = path.join(root, ".bunwire/client.ts");
    const registry = path.join(root, ".bunwire/registry.ts");
    await waitFor(async () => (await fs.readFile(client, "utf8")).includes('"users/getA"'), "Imported value was not compiled.");
    expect(await fs.readFile(registry, "utf8")).not.toContain("NotDiscovered");

    await fs.writeFile(valuesA, (await fs.readFile(valuesA, "utf8")).replace('"getA"', '"getA2"'));
    await waitFor(async () => (await fs.readFile(client, "utf8")).includes('"users/getA2"'), "Consumed helper edit was not compiled.");

    await fs.writeFile(barrel, 'export { ROUTE } from "./values-b.js";\n');
    await waitFor(async () => (await fs.readFile(client, "utf8")).includes('"users/getB"'), "Re-export change was not compiled.");
    const count = active.stdout.length;
    await fs.writeFile(valuesA, 'export const ROUTE = "unused";\n');
    await new Promise<void>((resolve) => setTimeout(resolve, 650));
    expect(active.stdout.length).toBe(count);

    const stable = await fs.readFile(client, "utf8");
    await fs.unlink(valuesB);
    await waitFor(() => active!.stderr.length > 0, "Deleted dependency did not report an error.");
    expect(await fs.readFile(client, "utf8")).toBe(stable);
    await fs.writeFile(valuesB, 'export const ROUTE = "getC";\n');
    await waitFor(async () => (await fs.readFile(client, "utf8")).includes('"users/getC"'), "Restored dependency did not recover.");

    await fs.writeFile(barrel, 'export { ROUTE } from "./new-helper.js";\n');
    const errors = active.stderr.length;
    await waitFor(() => active!.stderr.length > errors, "Missing import did not report an error.");
    await fs.writeFile(path.join(shared, "new-helper.ts"), 'export const ROUTE = "getD";\n');
    await waitFor(async () => (await fs.readFile(client, "utf8")).includes('"users/getD"'), "Creating missing helper alone did not recover.");
    expect(await active.stop()).toBe(0);
    active = undefined;
  });

  it("recovers an initially invalid config without restarting and closes on abort", async () => {
    const config = path.join(root, "bunwire.config.ts");
    const original = await fs.readFile(config, "utf8");
    await fs.writeFile(config, original.replace("./src/bun", "./missing-source"));
    active = startWatch(root);
    await waitFor(() => active!.stderr.some((line) => line.includes("SOURCE_ROOT_NOT_FOUND")), "Initial config error was not reported.");
    expect(await active.stop()).toBe(1);
    active = startWatch(root);
    await waitFor(() => active!.stderr.some((line) => line.includes("SOURCE_ROOT_NOT_FOUND")), "Restarted invalid config was not reported.");
    await fs.writeFile(config, original);
    await waitFor(async () => (await fs.readFile(path.join(root, ".bunwire/registry.ts"), "utf8")).includes("applicationRegistry"),
      "Fixing initial config did not recover.");
    const refreshed = active.stdout.length;
    await fs.appendFile(path.join(root, "src/bun/bootstrap.ts"), "\n// bootstrap watch input\n");
    await waitFor(() => active!.stdout.length > refreshed, "Bootstrap edit did not refresh the watcher.");
    expect(await active.stop()).toBe(0);
    active = undefined;
  });

  it("refreshes page inputs outside the managed source root", async () => {
    const config = path.join(root, "bunwire.config.ts");
    await fs.writeFile(config, (await fs.readFile(config, "utf8")).replace(
      'bootstrap: "./src/bun/bootstrap.ts",',
      'bootstrap: "./src/bun/bootstrap.ts",\n  pages: { root: "./src/pages", entry: "./src/frontend.ts" },',
    ));
    const pageRoot = path.join(root, "src/pages");
    await fs.mkdir(pageRoot);
    await fs.writeFile(path.join(root, "src/frontend.ts"), "export {};\n");
    await fs.writeFile(path.join(pageRoot, "Home.ts"), "export default function Home() { return null; }\n");
    active = startWatch(root);
    const pages = path.join(root, ".bunwire/pages.ts");
    await waitFor(async () => (await fs.readFile(pages, "utf8")).includes('"Home"'), "Initial page manifest was not generated.");
    await fs.writeFile(path.join(pageRoot, "About.ts"), "export default function About() { return null; }\n");
    await waitFor(async () => (await fs.readFile(pages, "utf8")).includes('"About"'), "Added page was not discovered.");
    await fs.unlink(path.join(pageRoot, "About.ts"));
    await waitFor(async () => !(await fs.readFile(pages, "utf8")).includes('"About"'), "Deleted page remained in the manifest.");
    expect(await active.stop()).toBe(0);
    active = undefined;
  });

  it("keeps Bun command artifacts current without a Vite server", async () => {
    const bunRoot = path.join(root, "bun-project");
    await fs.cp(bunFixture, bunRoot, { recursive: true });
    active = startWatch(bunRoot, true);
    const registry = path.join(bunRoot, ".bunwire/registry.ts");
    const commands = path.join(bunRoot, "src/commands.ts");
    await waitFor(async () => (await fs.readFile(registry, "utf8")).includes('"name": "greet"'),
      "Initial Bun command registry was not generated.");
    await fs.writeFile(commands, (await fs.readFile(commands, "utf8")).replace('name: "greet"', 'name: "salute"'));
    await waitFor(async () => (await fs.readFile(registry, "utf8")).includes('"name": "salute"'),
      "Bun command edit was not regenerated.");
    expect(await active.stop()).toBe(0);
    active = undefined;
  });
});
