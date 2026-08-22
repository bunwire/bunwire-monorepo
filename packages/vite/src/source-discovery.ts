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
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const linkedPath = await realpath(entryPath);
      if (!isWithin(projectRoot, linkedPath) || !isWithin(sourceRoot, linkedPath)) {
        throw new BunwireCompilerError(
          "SOURCE_GRAPH_ESCAPE",
          `Source graph entry "${entryPath}" resolves outside configured source root "${sourceRoot}".`,
          { filePath: entryPath },
        );
      }
      const linkedDetails = await stat(linkedPath);
      if (linkedDetails.isDirectory()) {
        await collectSourceFiles(linkedPath, sourceRoot, projectRoot, files);
      } else if (linkedDetails.isFile()
        && sourceExtensionPattern.test(linkedPath)
        && !declarationFilePattern.test(linkedPath)) {
        files.add(linkedPath);
      }
      continue;
    }
    if (entry.isDirectory()) {
      await collectSourceFiles(entryPath, sourceRoot, projectRoot, files);
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
    await collectSourceFiles(sourceRoot, sourceRoot, config.root, files);
  }
  return Object.freeze([...files].sort(comparePaths));
}
