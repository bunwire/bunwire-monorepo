import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tscPath = path.join(workspaceRoot, "node_modules", "typescript", "bin", "tsc");
const temporaryDirectories: string[] = [];

function runNode(
  script: string,
  argumentsList: readonly string[],
  cwd: string,
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [script, ...argumentsList], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
    timeout: 120_000,
  });
}

function runPnpm(argumentsList: readonly string[], cwd: string): SpawnSyncReturns<string> {
  const pnpmPath = process.env.npm_execpath;
  if (pnpmPath) {
    return runNode(pnpmPath, argumentsList, cwd);
  }
  return spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", [...argumentsList], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
    shell: process.platform === "win32",
    timeout: 120_000,
  });
}

function expectCommandPassed(result: SpawnSyncReturns<string>): void {
  expect(
    result.status,
    [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n"),
  ).toBe(0);
}

async function createTemporaryDirectory(label: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), `bunwire-${label}-`));
  temporaryDirectories.push(directory);
  return directory;
}

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, {
    force: true,
    recursive: true,
  })));
});

describe.sequential("Milestone 0 — Monorepo and Quality Foundation acceptance", () => {
  let isolatedCoreRoot: string;
  let isolatedCoreBuild: SpawnSyncReturns<string>;
  let corePackage: { dependencies?: Record<string, string> };

  beforeAll(async () => {
    isolatedCoreRoot = await createTemporaryDirectory("isolated-core");
    await cp(
      path.join(workspaceRoot, "packages", "core"),
      path.join(isolatedCoreRoot, "packages", "core"),
      {
        recursive: true,
        filter: (source) => !source.includes(`${path.sep}dist`),
      },
    );
    await cp(
      path.join(workspaceRoot, "tsconfig.base.json"),
      path.join(isolatedCoreRoot, "tsconfig.base.json"),
    );
    corePackage = JSON.parse(
      await readFile(path.join(isolatedCoreRoot, "packages", "core", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    isolatedCoreBuild = runNode(
      tscPath,
      ["-b", "packages/core", "--pretty", "false", "--force"],
      isolatedCoreRoot,
    );
  });

  it("core builds without Vite installed as a runtime dependency", () => {
    expect(corePackage.dependencies ?? {}).not.toHaveProperty("vite");
    expect(corePackage.dependencies ?? {}).not.toHaveProperty("@bunwire/vite");
    expectCommandPassed(isolatedCoreBuild);
  });

  it("core builds without Electrobun installed as a runtime dependency", () => {
    expect(corePackage.dependencies ?? {}).not.toHaveProperty("electrobun");
    expect(corePackage.dependencies ?? {}).not.toHaveProperty("@bunwire/electrobun");
    expectCommandPassed(isolatedCoreBuild);
  });

  it("workspace tests run from the repository root", async () => {
    const rootPackage = JSON.parse(
      await readFile(path.join(workspaceRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string>; private?: boolean };

    expect(process.cwd()).toBe(workspaceRoot);
    expect(rootPackage.private).toBe(true);
    expect(rootPackage.scripts?.test).toBe("vitest run");
  });

  it.each([
    "@bunwire/core",
    "@bunwire/vite",
    "@bunwire/electrobun",
    "@bunwire/example-electrobun-app",
  ])("package %s builds independently through its package script", (packageName) => {
    const build = runPnpm(["--filter", packageName, "build"], workspaceRoot);
    expectCommandPassed(build);
  }, 120_000);
});
