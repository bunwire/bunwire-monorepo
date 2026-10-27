import path from "node:path";
import { existsSync, statSync } from "node:fs";
import ts from "typescript";
import type { BunwireGeneratedArtifactPaths } from "./artifact-generator.js";
import { createBunwireProgram } from "./compiler-analysis.js";
import type { AnalyzeBunwireApplicationOptions, AnalyzedBunwireApplication, BunwireDiscoveryResult } from "./discovery.js";
import { canonicalCompilerPath } from "./path-identity.js";
import { discoverBunwireSourceFiles } from "./source-discovery.js";

export function isBunwirePathWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

/** Paths that can affect a successful compiler analysis, independent of the host watcher. */
export function bunwireWatchedPaths(application: AnalyzedBunwireApplication): readonly string[] {
  const externalDirectories = application.analysis.dependencies
    .filter((filePath) => !application.config.sourceRoots.some((root) => isBunwirePathWithin(root, filePath)))
    .map((filePath) => path.dirname(filePath));
  return Object.freeze([...new Set([
    application.config.configFile,
    application.config.bootstrap,
    ...application.config.sourceRoots,
    ...application.sourceFiles,
    ...application.analysis.dependencies,
    ...externalDirectories,
    ...(application.config.pages ? [application.config.pages.root, application.config.pages.entry,
      ...(application.config.pages.ssrEntry ? [application.config.pages.ssrEntry] : [])] : []),
  ])]);
}

/** Inputs available before the managed graph has compiled successfully. */
export function bunwireDiscoveryWatchedPaths(discovery: BunwireDiscoveryResult): readonly string[] {
  return Object.freeze([...new Set([
    discovery.config.configFile,
    discovery.config.bootstrap,
    ...discovery.config.sourceRoots,
    ...discovery.sourceFiles,
    ...(discovery.config.pages ? [discovery.config.pages.root, discovery.config.pages.entry,
      ...(discovery.config.pages.ssrEntry ? [discovery.config.pages.ssrEntry] : [])] : []),
  ])]);
}

/** Apply the same compiler relevance boundary to Vite and standalone watcher events. */
export function isBunwireRelevantChange(
  filePath: string,
  root: string,
  application: AnalyzedBunwireApplication | undefined,
  generatedPaths: BunwireGeneratedArtifactPaths,
  missingCandidates: readonly string[] = [],
): boolean {
  const resolved = path.resolve(filePath);
  const identity = canonicalCompilerPath(resolved);
  if ([generatedPaths.registry, generatedPaths.client, generatedPaths.declarations, generatedPaths.pages]
    .some((output) => output && identity === canonicalCompilerPath(output))) return false;
  if (missingCandidates.some((candidate) => identity === canonicalCompilerPath(candidate)
    || isBunwirePathWithin(resolved, candidate))) return true;
  if (!application) return isBunwirePathWithin(root, resolved);
  if (identity === canonicalCompilerPath(application.config.configFile)
    || identity === canonicalCompilerPath(application.config.bootstrap)) return true;
  return application.config.sourceRoots.some((sourceRoot) => isBunwirePathWithin(sourceRoot, resolved))
    || application.analysis.dependencies.some((dependency) => identity === canonicalCompilerPath(dependency))
    || (application.config.pages !== undefined && (
      identity === canonicalCompilerPath(application.config.pages.entry)
      || (application.config.pages.ssrEntry !== undefined
        && identity === canonicalCompilerPath(application.config.pages.ssrEntry))
      || isBunwirePathWithin(application.config.pages.root, resolved)
    ));
}

/** TypeScript's failed project-local lookup candidates, including re-export intermediates. */
export async function discoverMissingProjectImports(
  discovery: BunwireDiscoveryResult,
  options: Pick<AnalyzeBunwireApplicationOptions, "tsconfigPath" | "compilerOptions"> = {},
): Promise<readonly string[]> {
  const sourceFiles = await discoverBunwireSourceFiles(discovery.config);
  const { program } = createBunwireProgram({
    projectRoot: discovery.config.root,
    bootstrapPath: discovery.config.bootstrap,
    sourceFiles,
    ...(options.tsconfigPath ? { tsconfigPath: options.tsconfigPath } : {}),
    ...(options.compilerOptions ? { compilerOptions: options.compilerOptions } : {}),
  });
  const candidates = new Map<string, string>();
  const root = discovery.config.root;
  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || !isBunwirePathWithin(root, source.fileName)
      || path.relative(root, source.fileName).split(path.sep).includes("node_modules")) continue;
    for (const imported of ts.preProcessFile(source.text, true, true).importedFiles) {
      const resolution = ts.resolveModuleName(imported.fileName, source.fileName, program.getCompilerOptions(), ts.sys);
      if (resolution.resolvedModule) continue;
      const failedLookups = (resolution as typeof resolution & { failedLookupLocations?: readonly string[] }).failedLookupLocations ?? [];
      for (const failedPath of failedLookups) {
        const candidate = path.resolve(failedPath);
        const relative = path.relative(root, candidate);
        if (!isBunwirePathWithin(root, candidate) || relative.split(path.sep).some((part) =>
          ["node_modules", ".git", ".bunwire"].includes(part))
          || !/\.(?:[cm]?[jt]sx?)$/i.test(candidate)
          || /\.d\.(?:ts|mts|cts)$/i.test(candidate)) continue;
        candidates.set(canonicalCompilerPath(candidate), candidate);
      }
    }
  }
  return Object.freeze([...candidates.values()].sort());
}

/** Existing ancestors to watch until currently missing imports can be created. */
export function missingProjectImportDirectories(root: string, candidates: readonly string[]): readonly string[] {
  const directories = new Set<string>();
  for (const candidate of candidates) {
    let directory = path.dirname(candidate);
    while (!existsSync(directory) && isBunwirePathWithin(root, directory) && directory !== root) directory = path.dirname(directory);
    if (isBunwirePathWithin(root, directory) && existsSync(directory) && statSync(directory).isDirectory()) directories.add(directory);
  }
  return Object.freeze([...directories].sort());
}
