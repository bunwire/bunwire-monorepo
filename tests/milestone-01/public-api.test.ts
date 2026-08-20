import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function collectProductionSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const sources: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      sources.push(...await collectProductionSources(entryPath));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      sources.push(await readFile(entryPath, "utf8"));
    }
  }
  return sources;
}

describe("Milestone 1 — public extension acceptance", () => {
  it("adapter-created class descriptors compile using only Core public APIs", () => {
    const tscPath = path.join(workspaceRoot, "node_modules", "typescript", "bin", "tsc");
    const result = spawnSync(process.execPath, [
      tscPath,
      "-p",
      "tests/fixtures/milestone-1-adapter/tsconfig.json",
      "--pretty",
      "false",
    ], {
      cwd: workspaceRoot,
      encoding: "utf8",
      timeout: 30_000,
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  }, 30_000);

  it("Core production source contains no concrete adapter-specific class-kind IDs", async () => {
    const sources = await collectProductionSources(path.join(workspaceRoot, "packages", "core", "src"));
    const adapterIdDeclarations = sources.flatMap((source) => (
      [...source.matchAll(/\bid\s*:\s*["']([a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+)["']/g)]
        .map((match) => match[1]!)
        .filter((id) => !id.startsWith("core."))
    ));

    expect(adapterIdDeclarations).toEqual([]);
  });
});
