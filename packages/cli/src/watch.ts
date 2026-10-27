import { watch, realpathSync, statSync, type FSWatcher } from "node:fs";
import path from "node:path";
import {
  BunwireCompilerError,
  analyzeBunwireApplication,
  bunwireDiscoveryWatchedPaths,
  bunwireWatchedPaths,
  discoverBunwireApplication,
  discoverMissingProjectImports,
  generateBunwireArtifactsFromApplication,
  isBunwirePathWithin,
  isBunwireRelevantChange,
  missingProjectImportDirectories,
  resolveGeneratedArtifactPaths,
} from "@bunwire/vite/compiler";
import type { BunwireCliIO } from "./index.js";

interface WatchTarget {
  readonly directory: string;
  readonly recursive: boolean;
}

function isDirectory(filePath: string): boolean {
  try { return statSync(filePath).isDirectory(); } catch { return false; }
}

function nearestExistingDirectory(root: string, filePath: string): string | undefined {
  let directory = isDirectory(filePath) ? filePath : path.dirname(filePath);
  while (!isDirectory(directory) && isBunwirePathWithin(root, directory) && directory !== root) {
    directory = path.dirname(directory);
  }
  return isBunwirePathWithin(root, directory) && isDirectory(directory) ? directory : undefined;
}

/** Watch one Bunwire root until aborted, preserving the last successful artifacts on failure. */
export async function watchBunwireProject(
  requestedRoot: string,
  io: BunwireCliIO,
  signal: AbortSignal | undefined,
  formatDiagnostic: (error: unknown) => string,
): Promise<number> {
  let root: string;
  try {
    root = realpathSync(requestedRoot);
    if (!statSync(root).isDirectory()) throw new Error(`Bunwire project root "${root}" is not a directory.`);
  } catch (error) {
    io.stderr(formatDiagnostic(error));
    return 1;
  }

  type Application = Awaited<ReturnType<typeof analyzeBunwireApplication>>;
  type Discovery = Awaited<ReturnType<typeof discoverBunwireApplication>>;
  let latestApplication: Application | undefined;
  let provisionalDiscovery: Discovery | undefined;
  let missingCandidates: readonly string[] = [];
  let failurePath: string | undefined;
  let failed = false;
  let closing = false;
  let dirty = false;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let generatedPaths = resolveGeneratedArtifactPaths(root, {});
  const watchers = new Map<string, { readonly watcher: FSWatcher; readonly target: WatchTarget }>();

  const addTarget = (targets: Map<string, WatchTarget>, directory: string, recursive: boolean): void => {
    if (!isBunwirePathWithin(root, directory) || !isDirectory(directory)) return;
    const resolved = path.resolve(directory);
    const previous = targets.get(resolved);
    targets.set(resolved, { directory: resolved, recursive: recursive || previous?.recursive === true });
  };

  const targetsFor = (): Map<string, WatchTarget> => {
    const targets = new Map<string, WatchTarget>();
    addTarget(targets, root, false);
    const config = provisionalDiscovery?.config ?? latestApplication?.config;
    if (config) {
      for (const sourceRoot of config.sourceRoots) addTarget(targets, sourceRoot, true);
      if (config.pages) addTarget(targets, config.pages.root, true);
    }
    const inputs = [
      ...(latestApplication ? bunwireWatchedPaths(latestApplication) : []),
      ...(provisionalDiscovery ? bunwireDiscoveryWatchedPaths(provisionalDiscovery) : []),
    ];
    for (const input of inputs) {
      const directory = isDirectory(input) ? input : path.dirname(input);
      addTarget(targets, directory, targets.get(path.resolve(directory))?.recursive ?? false);
    }
    if (failed) {
      for (const directory of missingProjectImportDirectories(root, missingCandidates)) {
        addTarget(targets, directory, true);
      }
      if (failurePath) {
        const ancestor = nearestExistingDirectory(root, failurePath);
        if (ancestor) addTarget(targets, ancestor, true);
      }
    }
    return targets;
  };

  const isIgnoredEvent = (filePath: string): boolean => {
    const parts = path.relative(root, filePath).split(path.sep);
    return parts.some((part) => ["node_modules", ".git", ".bunwire"].includes(part));
  };

  const schedule = (): void => {
    if (closing) return;
    dirty = true;
    if (running || refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      void flush();
    }, 80);
  };

  const reconcile = (): void => {
    if (closing) return;
    const targets = targetsFor();
    for (const [directory, active] of watchers) {
      const wanted = targets.get(directory);
      if (!wanted || wanted.recursive !== active.target.recursive) {
        active.watcher.close();
        watchers.delete(directory);
      }
    }
    for (const [directory, target] of targets) {
      if (watchers.has(directory)) continue;
      const watcher = watch(directory, { recursive: target.recursive }, (_event, filename) => {
        if (closing) return;
        const changed = filename ? path.resolve(directory, filename.toString()) : directory;
        if (isIgnoredEvent(changed)) return;
        if (!failed && !isBunwireRelevantChange(changed, root, latestApplication, generatedPaths, missingCandidates)) return;
        schedule();
      });
      watcher.on("error", (error) => {
        if (closing) return;
        io.stderr(formatDiagnostic(error));
        failed = true;
        watcher.close();
        watchers.delete(directory);
        schedule();
      });
      watchers.set(directory, { watcher, target });
    }
  };

  const refresh = async (): Promise<void> => {
    try {
      const application = await analyzeBunwireApplication({ root });
      generatedPaths = resolveGeneratedArtifactPaths(application.config.root, {});
      latestApplication = application;
      const result = await generateBunwireArtifactsFromApplication(application);
      provisionalDiscovery = undefined;
      missingCandidates = [];
      failurePath = undefined;
      failed = false;
      reconcile();
      io.stdout(`Generated Bunwire artifacts in ${path.dirname(result.paths.registry)} (${result.changedPaths.length} changed).`);
    } catch (error) {
      failed = true;
      failurePath = error instanceof BunwireCompilerError ? error.filePath : undefined;
      io.stderr(formatDiagnostic(error));
      try {
        provisionalDiscovery = await discoverBunwireApplication({ root });
        missingCandidates = await discoverMissingProjectImports(provisionalDiscovery);
      } catch {
        // The compiler diagnostic above remains authoritative; root and known paths stay watched.
      }
      try { reconcile(); } catch (watchError) { io.stderr(formatDiagnostic(watchError)); }
    }
  };

  const flush = (): Promise<void> => {
    if (running) return running;
    running = (async () => {
      while (dirty && !closing) {
        dirty = false;
        await refresh();
      }
    })().finally(() => {
      running = undefined;
      if (dirty && !closing) schedule();
    });
    return running;
  };

  try {
    reconcile();
  } catch (error) {
    io.stderr(formatDiagnostic(error));
    for (const active of watchers.values()) active.watcher.close();
    return 1;
  }
  io.stdout(`Watching Bunwire project ${root}.`);
  dirty = true;
  void flush();

  return new Promise<number>((resolve) => {
    const stop = (): void => {
      if (closing) return;
      closing = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      for (const active of watchers.values()) active.watcher.close();
      watchers.clear();
      signal?.removeEventListener("abort", stop);
      void (running ?? Promise.resolve()).then(() => resolve(failed ? 1 : 0));
    };
    if (signal?.aborted) stop();
    else signal?.addEventListener("abort", stop, { once: true });
  });
}
