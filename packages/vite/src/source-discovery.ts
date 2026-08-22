import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { ResolvedBunwireConfig } from "./config.js";
import { BunwireCompilerError } from "./diagnostics.js";

const ignoredDirectoryNames = new Set([".git", "node_modules"]);
const sourceExtensionPattern = /\.(?:[cm]?[jt]sx?)$/i;
const declarationFilePattern = /\.d\.(?:ts|mts|cts)$/i;

function stablePath(pathname: string): string {
  return pathname.split(path.sep).join("/");
}

function comparePaths(left: string, right: string): number {
  const normalizedLeft = stablePath(left);
  const normalizedRight = stablePath(right);
  return normalizedLeft < normalizedRight ? -1 : normalizedLeft > normalizedRight ? 1 : 0;
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`)
    && relative !== ".."
    && !path.isAbsolute(relative));
}

async function collectSourceFiles(
  directory: string,
  sourceRoot: string,
  projectRoot: string,
  files: Set<string>,
  visitedDirectories: Set<string>,
): Promise<void> {
  let canonicalDirectory: string;
  try {
    canonicalDirectory = await realpath(directory);
  } catch (cause) {
    throw new BunwireCompilerError(
      "SOURCE_GRAPH_ESCAPE",
      `Unable to resolve source graph directory "${directory}". Check for a broken or inaccessible filesystem link.`,
      { filePath: directory, cause },
    );
  }
  if (visitedDirectories.has(canonicalDirectory)) {
    return;
  }
  visitedDirectories.add(canonicalDirectory);

  let entries;
  try {
    entries = await readdir(canonicalDirectory, { withFileTypes: true });
  } catch (cause) {
    throw new BunwireCompilerError(
      "SOURCE_GRAPH_ESCAPE",
      `Unable to read source graph directory "${canonicalDirectory}".`,
      { filePath: canonicalDirectory, cause },
    );
  }
  entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) {
      continue;
    }
    const entryPath = path.join(canonicalDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      let linkedPath: string;
      try {
        linkedPath = await realpath(entryPath);
      } catch (cause) {
        throw new BunwireCompilerError(
          "SOURCE_GRAPH_ESCAPE",
          `Source graph link "${entryPath}" is broken or inaccessible.`,
          { filePath: entryPath, cause },
        );
      }
      if (!isWithin(projectRoot, linkedPath) || !isWithin(sourceRoot, linkedPath)) {
        throw new BunwireCompilerError(
          "SOURCE_GRAPH_ESCAPE",
          `Source graph entry "${entryPath}" resolves outside configured source root "${sourceRoot}".`,
          { filePath: entryPath },
        );
      }
      const linkedDetails = await stat(linkedPath);
      if (linkedDetails.isDirectory()) {
        await collectSourceFiles(
          linkedPath,
          sourceRoot,
          projectRoot,
          files,
          visitedDirectories,
        );
      } else if (linkedDetails.isFile()
        && sourceExtensionPattern.test(linkedPath)
        && !declarationFilePattern.test(linkedPath)) {
        files.add(linkedPath);
      }
      continue;
    }
    if (entry.isDirectory()) {
      await collectSourceFiles(entryPath, sourceRoot, projectRoot, files, visitedDirectories);
    } else if (entry.isFile()
      && sourceExtensionPattern.test(entry.name)
      && !declarationFilePattern.test(entry.name)) {
      files.add(await realpath(entryPath));
    }
  }
}

export async function discoverBunwireSourceFiles(
  config: ResolvedBunwireConfig,
): Promise<readonly string[]> {
  const files = new Set<string>();
  const roots = [...config.sourceRoots].sort(comparePaths);
  for (const sourceRoot of roots) {
    await collectSourceFiles(sourceRoot, sourceRoot, config.root, files, new Set());
  }
  return Object.freeze([...files].sort(comparePaths));
}
