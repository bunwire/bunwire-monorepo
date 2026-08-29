import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const forbiddenCoreSpecifiers = [
  /^vite(?:\/|$)/,
  /^@bunwire\/vite(?:\/|$)/,
  /^electrobun(?:\/|$)/,
  /^@bunwire\/electrobun(?:\/|$)/,
  /^@bunwire\/bun(?:\/|$)/,
  /(?:^|\/)packages\/(?:vite|electrobun|bun)(?:\/|$)/,
];

const forbiddenRuntimeDiscoverySpecifiers = [/^node:fs(?:\/|$)/, /^fs(?:\/|$)/];
const forbiddenVitePlatformTerms = [
  /@bunwire\/electrobun/i,
  /(?:^|["'.])electrobun(?:[\/."']|$)/i,
  /\bELECTROBUN_[A-Z0-9_]+\b/,
  /\bElectrobun(?:Adapter|Method|Middleware|Route|Message|Window|Webview|Context)\b/,
  /@bunwire\/bun/i,
  /\bBUN_COMPILER_DESCRIPTOR\b/,
  /\bBunAdapter\b/,
];
const crossPackageSourceSpecifier = /(?:^|\/)packages\/(core|vite|electrobun|bun)\/src(?:\/|$)/;

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

export async function collectTypeScriptFiles(directory) {
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

function relativeSourceFiles(rootDirectory, packageName) {
  return collectTypeScriptFiles(path.join(rootDirectory, "packages", packageName, "src"));
}

export function findForbiddenRuntimeDiscoveryImports(files) {
  return files.flatMap((file) => {
    const violations = [];
    for (const match of file.source.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2];
      if (specifier && forbiddenRuntimeDiscoverySpecifiers.some((pattern) => pattern.test(specifier))) {
        violations.push({ path: file.path, specifier });
      }
    }
    return violations;
  });
}

export function findVitePlatformTerms(files) {
  return files.flatMap((file) => forbiddenVitePlatformTerms
    .filter((pattern) => pattern.test(file.source))
    .map((pattern) => ({ path: file.path, pattern: pattern.source })));
}

export function findCrossPackageSourceImports(files) {
  return files.flatMap((file) => {
    const violations = [];
    for (const match of file.source.matchAll(importPattern)) {
      const specifier = (match[1] ?? match[2])?.replaceAll("\\", "/");
      if (specifier && crossPackageSourceSpecifier.test(specifier)) {
        violations.push({ path: file.path, specifier });
      }
    }
    return violations;
  });
}

export async function checkCoreBoundaries(rootDirectory) {
  const coreSource = path.join(rootDirectory, "packages", "core", "src");
  return findForbiddenCoreImports(await collectTypeScriptFiles(coreSource));
}

export async function checkReleaseBoundaries(rootDirectory) {
  const [core, vite, electrobun, bun] = await Promise.all([
    relativeSourceFiles(rootDirectory, "core"),
    relativeSourceFiles(rootDirectory, "vite"),
    relativeSourceFiles(rootDirectory, "electrobun"),
    relativeSourceFiles(rootDirectory, "bun"),
  ]);
  return {
    coreImports: findForbiddenCoreImports(core),
    vitePlatformTerms: findVitePlatformTerms(vite),
    runtimeDiscoveryImports: findForbiddenRuntimeDiscoveryImports([...core, ...electrobun, ...bun]),
    crossPackageSourceImports: findCrossPackageSourceImports([...core, ...vite, ...electrobun, ...bun]),
  };
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const releaseBoundaries = await checkReleaseBoundaries(rootDirectory);
  const violations = Object.values(releaseBoundaries).flat();
  if (violations.length > 0) {
    for (const [gate, failures] of Object.entries(releaseBoundaries)) {
      for (const violation of failures) {
        console.error(`${gate} violation in ${violation.path}: ${violation.specifier ?? violation.pattern}`);
      }
    }
    process.exitCode = 1;
  } else {
    console.log("Bunwire release package boundaries are valid.");
  }
}
