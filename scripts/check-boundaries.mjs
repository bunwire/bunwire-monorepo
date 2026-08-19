import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const forbiddenCoreSpecifiers = [
  /^vite(?:\/|$)/,
  /^@bunwire\/vite(?:\/|$)/,
  /^electrobun(?:\/|$)/,
  /^@bunwire\/electrobun(?:\/|$)/,
  /(?:^|\/)packages\/(?:vite|electrobun)(?:\/|$)/,
];

const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

export function findForbiddenCoreImports(files) {
  const violations = [];

  for (const file of files) {
    for (const match of file.source.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2];
      if (specifier && forbiddenCoreSpecifiers.some((pattern) => pattern.test(specifier))) {
        violations.push({ path: file.path, specifier });
      }
    }
  }

  return violations;
}

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTypeScriptFiles(entryPath));
    } else if (/\.[cm]?tsx?$/.test(entry.name)) {
      files.push({ path: entryPath, source: await readFile(entryPath, "utf8") });
    }
  }

  return files;
}

export async function checkCoreBoundaries(rootDirectory) {
  const coreSource = path.join(rootDirectory, "packages", "core", "src");
  return findForbiddenCoreImports(await collectTypeScriptFiles(coreSource));
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const violations = await checkCoreBoundaries(rootDirectory);
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`Forbidden Core import in ${violation.path}: ${violation.specifier}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Core package boundaries are valid.");
  }
}
