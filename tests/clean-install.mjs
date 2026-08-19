import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cleanRoot = await mkdtemp(path.join(tmpdir(), "bunwire-clean-install-"));

function runNode(script, argumentsList, cwd) {
  const result = spawnSync(process.execPath, [script, ...argumentsList], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
    stdio: "pipe",
    timeout: 180_000,
  });
  if (result.status !== 0) {
    throw new Error(
      [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n"),
    );
  }
}

try {
  for (const file of [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.json",
    "tsconfig.base.json",
    "tsconfig.tests.json",
    "vitest.config.ts",
  ]) {
    await cp(path.join(workspaceRoot, file), path.join(cleanRoot, file));
  }
  for (const directory of ["packages", "examples", "scripts", "tests"]) {
    await cp(path.join(workspaceRoot, directory), path.join(cleanRoot, directory), {
      recursive: true,
      filter: (source) => (
        !source.includes(`${path.sep}dist`)
        && !source.includes(`${path.sep}node_modules`)
      ),
    });
  }

  const pnpmPath = process.env.npm_execpath;
  if (!pnpmPath) {
    throw new Error("npm_execpath is unavailable; run this check through pnpm test:clean-install.");
  }
  runNode(pnpmPath, ["install", "--frozen-lockfile", "--ignore-scripts"], cleanRoot);

  const cleanTsc = path.join(cleanRoot, "node_modules", "typescript", "bin", "tsc");
  runNode(cleanTsc, ["-b", "--pretty", "false"], cleanRoot);
  runNode(cleanTsc, ["-p", "tsconfig.tests.json", "--noEmit", "--pretty", "false"], cleanRoot);

  console.log("Clean frozen-lockfile install and workspace typecheck passed.");
} finally {
  await rm(cleanRoot, { force: true, recursive: true });
}
