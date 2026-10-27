import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateBunwireArtifacts } from "@bunwire/vite/compiler";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const binary = path.join(repositoryRoot, "packages/cli/dist/bin.js");
const fixture = path.join(repositoryRoot, "tests/fixtures/milestone-12-electrobun");

function run(args: string[], cwd: string) {
  return spawnSync(process.execPath, [binary, ...args], { cwd, encoding: "utf8", timeout: 120_000 });
}

describe.sequential("Milestone 23 — CLI physical generation", () => {
  let parent: string;
  let project: string;
  let neighbor: string;

  beforeAll(async () => {
    parent = await fs.mkdtemp(path.join(repositoryRoot, ".tmp-bunwire-m23-"));
    project = path.join(parent, "project");
    neighbor = path.join(parent, "neighbor");
    await fs.cp(fixture, project, { recursive: true });
    await fs.cp(fixture, neighbor, { recursive: true });
    await fs.writeFile(path.join(project, "tsconfig.json"), JSON.stringify({ compilerOptions: { experimentalDecorators: true } }));
    await fs.writeFile(path.join(neighbor, "tsconfig.json"), JSON.stringify({ compilerOptions: { experimentalDecorators: true } }));
  });

  afterAll(async () => {
    if (path.dirname(parent) !== repositoryRoot || !path.basename(parent).startsWith(".tmp-bunwire-m23-")) {
      throw new Error("Unsafe test cleanup target.");
    }
    await fs.rm(parent, { recursive: true, force: true });
  });

  it("provides help and an accurate command catalog without a project", () => {
    expect(run(["help"], parent).status).toBe(0);
    const list = run(["list"], parent);
    expect(list.status).toBe(0);
    expect(list.stdout).toContain("generate");
    expect(list.stdout).toContain("watch");
  });

  it("generates API-identical artifacts and preserves unchanged modification times", async () => {
    const expected = await generateBunwireArtifacts({ root: project });
    const files = [expected.paths.registry, expected.paths.client, expected.paths.declarations];
    const contents = await Promise.all(files.map((file) => fs.readFile(file, "utf8")));
    const times = await Promise.all(files.map(async (file) => (await fs.stat(file)).mtimeMs));
    const result = run(["generate", "--root", "project"], parent);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("(0 changed)");
    expect(await Promise.all(files.map((file) => fs.readFile(file, "utf8")))).toEqual(contents);
    expect(await Promise.all(files.map(async (file) => (await fs.stat(file)).mtimeMs))).toEqual(times);
    const after = await generateBunwireArtifacts({ root: project });
    expect(after.registryHash).toBe(expected.registryHash);
    expect(after.clientHash).toBe(expected.clientHash);
  });

  it("does not search neighboring or parent projects", async () => {
    const result = run(["generate"], parent);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("CONFIG_NOT_FOUND");
    expect(await fs.stat(path.join(neighbor, ".bunwire/registry.ts")).then(() => true, () => false)).toBe(false);
  });

  it("accepts a Bun command-role fixture through the same generator", async () => {
    const bunRoot = path.join(repositoryRoot, "examples/bun-app/command");
    const expected = await generateBunwireArtifacts({ root: bunRoot });
    const before = await fs.readFile(expected.paths.registry, "utf8");
    const result = run(["--root", bunRoot, "generate"], parent);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("(0 changed)");
    expect(await fs.readFile(expected.paths.registry, "utf8")).toBe(before);
  });

  it("reports analysis errors without replacing successful artifacts", async () => {
    const registry = path.join(project, ".bunwire/registry.ts");
    const original = await fs.readFile(registry, "utf8");
    const config = path.join(project, "bunwire.config.ts");
    const saved = await fs.readFile(config, "utf8");
    try {
      await fs.writeFile(config, saved.replace("./src/bun", "./missing-source"));
      const result = run(["generate", "--root=project"], parent);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("SOURCE_ROOT_NOT_FOUND");
      expect(await fs.readFile(registry, "utf8")).toBe(original);
    } finally {
      await fs.writeFile(config, saved);
    }
  });

  it("reports compiler errors without executing application source", async () => {
    const source = path.join(project, "src/bun/application.ts");
    const saved = await fs.readFile(source, "utf8");
    const registry = path.join(project, ".bunwire/registry.ts");
    const original = await fs.readFile(registry, "utf8");
    try {
      await fs.writeFile(source, `${saved.replace('@Route("get")', '@Route(Symbol("invalid"))')}\nthrow new Error("Application source was executed");\n`);
      const result = run(["generate", "--root", project], parent);
      expect(result.status).not.toBe(0);
      expect(result.stderr).not.toContain("Application source was executed");
      expect(result.stderr).toMatch(/DECORATOR_ARGUMENT_INVALID|MANAGED_METHOD_INVALID/);
      expect(await fs.readFile(registry, "utf8")).toBe(original);
    } finally {
      await fs.writeFile(source, saved);
    }
  });
});
