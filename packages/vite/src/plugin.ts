import path from "node:path";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type {
  HmrContext,
  ModuleNode,
  Plugin,
  ResolvedConfig,
  ViteDevServer,
  Rollup,
} from "vite";
import {
  generateBunwireArtifactsFromApplication,
  resolveGeneratedArtifactPaths,
  type GenerateBunwireArtifactsOptions,
} from "./artifact-generator.js";
import { generateCallerContractModule } from "./caller-contract-generator.js";
import {
  analyzeBunwireApplication,
  type AnalyzedBunwireApplication,
} from "./discovery.js";
import { BunwireCompilerError } from "./diagnostics.js";
import { canonicalCompilerPath } from "./path-identity.js";
import { generateRuntimeRegistryModule } from "./registry-generator.js";
import {
  bunwireWatchedPaths,
  discoverMissingProjectImports,
  isBunwireRelevantChange,
  missingProjectImportDirectories,
} from "./watch-inputs.js";
import { generateBunwirePageModule, renderBunwirePageManifest, type BunwirePageAssetManifest } from "./page-generator.js";
import {
  BUNWIRE_CLIENT_MODULE_ID,
  BUNWIRE_REGISTRY_MODULE_ID,
  BUNWIRE_RESOLVED_CLIENT_MODULE_ID,
  BUNWIRE_PAGES_MODULE_ID,
  BUNWIRE_RESOLVED_PAGES_MODULE_ID,
  BUNWIRE_RESOLVED_REGISTRY_MODULE_ID,
  isBunwireVirtualModuleId,
} from "./virtual-modules.js";

export interface BunwireVitePluginOptions extends GenerateBunwireArtifactsOptions {}

interface BunwirePluginHooks {
  readonly name: "bunwire";
  readonly enforce: "pre";
  configResolved(config: ResolvedConfig): void;
  configureServer(server: ViteDevServer): void;
  buildStart(this: BunwirePluginContext): Promise<void>;
  generateBundle(this: BunwirePluginContext, _options: unknown, bundle: Rollup.OutputBundle): Promise<void>;
  writeBundle(): Promise<void>;
  resolveId(id: string): string | undefined;
  load(id: string): Promise<string | undefined>;
  watchChange(this: BunwirePluginContext, id: string): Promise<void>;
  handleHotUpdate(context: HmrContext): Promise<ModuleNode[] | undefined>;
  closeBundle(): Promise<void>;
}

interface BunwirePluginContext {
  addWatchFile(id: string): void;
  emitFile(file: Rollup.EmittedFile): string;
}

export type BunwireVitePlugin = Plugin & BunwirePluginHooks;

export function bunwire(options: BunwireVitePluginOptions = {}): BunwireVitePlugin {
  let viteRoot = path.resolve(options.root ?? process.cwd());
  let analyzedApplication: Promise<AnalyzedBunwireApplication> | undefined;
  let latestApplication: AnalyzedBunwireApplication | undefined;
  let devServer: ViteDevServer | undefined;
  let refreshQueue: Promise<unknown> = Promise.resolve();
  let generatedPaths = resolveGeneratedArtifactPaths(viteRoot, options);
  let resolvedViteConfig: ResolvedConfig | undefined;
  let pageServerManifest: { protocol: 1; serverEntry: string } | undefined;
  let closing = false;
  let missingProjectImports: readonly string[] = [];

  const analyze = (): Promise<AnalyzedBunwireApplication> => {
    analyzedApplication ??= analyzeBunwireApplication({
      ...options,
      root: options.root ? path.resolve(options.root) : viteRoot,
    }).then((application) => {
      latestApplication = application;
      generatedPaths = resolveGeneratedArtifactPaths(application.config.root, options);
      devServer?.watcher.add(bunwireWatchedPaths(application));
      return application;
    });
    return analyzedApplication;
  };

  const resetAnalysis = (): void => {
    analyzedApplication = undefined;
  };

  const registerWatchFiles = (
    context: BunwirePluginContext | undefined,
    application: AnalyzedBunwireApplication,
  ): void => {
    for (const filePath of bunwireWatchedPaths(application)) context?.addWatchFile(filePath);
  };

  const refreshArtifacts = async (
    context?: BunwirePluginContext,
  ): Promise<AnalyzedBunwireApplication> => {
    const application = await analyze();
    registerWatchFiles(context, application);
    await generateBunwireArtifactsFromApplication(application, options);
    missingProjectImports = [];
    return application;
  };

  const watchMissingProjectImports = async (): Promise<void> => {
    const application = latestApplication;
    if (!application || !devServer) return;
    try {
      missingProjectImports = await discoverMissingProjectImports(application, options);
      devServer.watcher.add(missingProjectImportDirectories(application.config.root, missingProjectImports));
    } catch {
      // Preserve the original compiler diagnostic if recovery-watch discovery also fails.
    }
  };

  const queueRefresh = (
    context?: BunwirePluginContext,
  ): Promise<AnalyzedBunwireApplication> => {
    const refresh = refreshQueue.catch(() => undefined).then(async () => {
      resetAnalysis();
      return refreshArtifacts(context);
    });
    refreshQueue = refresh;
    return refresh;
  };

  const isRelevantChange = (filePath: string): boolean => isBunwireRelevantChange(
    filePath, viteRoot, latestApplication, generatedPaths, missingProjectImports,
  );

  const loadRegistry = async (): Promise<string> => {
    const application = await analyze();
    return generateRuntimeRegistryModule({
      analysis: application.analysis,
      extensions: application.extensions,
      modulePath: generatedPaths.registry,
      importMode: "vite",
    }).code;
  };

  const loadClient = async (): Promise<string> => {
    const application = await analyze();
    return generateCallerContractModule({
      analysis: application.analysis,
      extensions: application.extensions,
      modulePath: generatedPaths.client,
      declarationModulePath: generatedPaths.declarations,
      importMode: "vite",
    }).code;
  };

  const loadPages = async (): Promise<string> => {
    const application = await analyze();
    const generated = await generateBunwirePageModule(application.config);
    if (!generated) throw new BunwireCompilerError("CONFIG_INVALID", `Virtual module "${BUNWIRE_PAGES_MODULE_ID}" requires a Bunwire pages configuration.`);
    return generated.code;
  };

  const invalidateVirtualModules = (server: ViteDevServer): ModuleNode[] => {
    const affected: ModuleNode[] = [];
    for (const id of [BUNWIRE_RESOLVED_REGISTRY_MODULE_ID, BUNWIRE_RESOLVED_CLIENT_MODULE_ID, BUNWIRE_RESOLVED_PAGES_MODULE_ID]) {
      const module = server.moduleGraph.getModuleById(id);
      if (!module) continue;
      server.moduleGraph.invalidateModule(module);
      affected.push(module);
    }
    return affected;
  };

  const refreshForWatchedChange = async (id: string, context?: BunwirePluginContext): Promise<void> => {
    if (closing || !isRelevantChange(id)) return;
    try {
      await queueRefresh(context);
    } catch (cause) {
      await watchMissingProjectImports();
      if (!devServer) throw cause;
      const error = cause instanceof Error ? cause : new Error(String(cause));
      devServer.ws.send({ type: "error", err: { message: error.message, stack: error.stack ?? error.message,
        plugin: "bunwire" } });
    } finally {
      if (devServer) invalidateVirtualModules(devServer);
    }
  };

  const plugin: BunwirePluginHooks = {
    name: "bunwire",
    enforce: "pre",
    configResolved(config): void {
      resolvedViteConfig = config;
      if (!options.root) {
        viteRoot = path.resolve(config.root);
        generatedPaths = resolveGeneratedArtifactPaths(viteRoot, options);
        resetAnalysis();
      }
    },
    configureServer(server): void {
      devServer = server;
      if (latestApplication) server.watcher.add(bunwireWatchedPaths(latestApplication));
      for (const event of ["add", "addDir", "unlink"] as const) {
        server.watcher.on(event, (filePath) => { void refreshForWatchedChange(filePath); });
      }
    },
    async buildStart(): Promise<void> {
      resetAnalysis();
      await refreshArtifacts(typeof this.addWatchFile === "function" ? this : undefined);
    },
    async generateBundle(_options, bundle): Promise<void> {
      const application = latestApplication ?? await analyze();
      if (!application.config.pages || resolvedViteConfig?.command !== "build") return;
      const generated = await generateBunwirePageModule(application.config);
      if (!generated) return;
      const chunks = Object.values(bundle).filter((output): output is Rollup.OutputChunk => output.type === "chunk");
      if (resolvedViteConfig.build.ssr) {
        const ssrEntry = application.config.pages.ssrEntry;
        if (!ssrEntry) throw new BunwireCompilerError("CONFIG_INVALID", "Vite page SSR build requires pages.ssrEntry in bunwire.config.");
        const serverChunk = chunks.find((chunk) => chunk.isEntry && chunk.facadeModuleId
          && canonicalCompilerPath(chunk.facadeModuleId) === canonicalCompilerPath(ssrEntry));
        if (!serverChunk) throw new BunwireCompilerError("CONFIG_INVALID", `Vite SSR output does not contain configured page entry "${ssrEntry}".`);
        pageServerManifest = { protocol: 1, serverEntry: path.resolve(resolvedViteConfig.root, resolvedViteConfig.build.outDir, serverChunk.fileName) };
        return;
      }
      const entry = chunks.find((chunk) => chunk.isEntry && chunk.facadeModuleId
        && canonicalCompilerPath(chunk.facadeModuleId) === canonicalCompilerPath(application.config.pages!.entry))
        ?? chunks.find((chunk) => chunk.isEntry);
      if (!entry) throw new BunwireCompilerError("CONFIG_INVALID", `Vite production output does not contain the configured Bunwire page entry "${application.config.pages.entry}".`);
      const styles = Object.values(bundle)
        .filter((output): output is Rollup.OutputAsset => output.type === "asset" && output.fileName.endsWith(".css"))
        .map((asset) => `/${asset.fileName}`)
        .sort();
      const versionHash = createHash("sha256");
      for (const output of Object.values(bundle).sort((left, right) => left.fileName.localeCompare(right.fileName))) {
        versionHash.update(output.fileName);
        versionHash.update(output.type === "chunk" ? output.code : typeof output.source === "string" ? output.source : output.source);
      }
      const manifest: BunwirePageAssetManifest = Object.freeze({
        protocol: 1, mode: "production", components: generated.pages.map(({ name }) => name),
        entry: `/${entry.fileName}`, ...(styles.length ? { styles: Object.freeze(styles) } : {}),
        version: versionHash.digest("hex"),
        assetRoot: path.relative(application.config.root, path.resolve(resolvedViteConfig.root, resolvedViteConfig.build.outDir)).replaceAll(path.sep, "/"),
        assets: Object.freeze(Object.values(bundle).map((output) => `/${output.fileName}`).sort()),
      });
      const code = renderBunwirePageManifest(manifest);
      let current: string | undefined;
      const pagesPath = generatedPaths.pages;
      if (!pagesPath) throw new BunwireCompilerError("CONFIG_INVALID", "Bunwire page artifact path is unavailable.");
      try { current = await readFile(pagesPath, "utf8"); } catch {}
      if (current !== code) { await mkdir(path.dirname(pagesPath), { recursive: true }); await writeFile(pagesPath, code, "utf8"); }
      this.emitFile({ type: "asset", fileName: "bunwire-pages.json", source: JSON.stringify(manifest, null, 2) });
    },
    async writeBundle(): Promise<void> {
      if (!pageServerManifest || !resolvedViteConfig) return;
      const outputDirectory = path.resolve(resolvedViteConfig.root, resolvedViteConfig.build.outDir);
      await mkdir(outputDirectory, { recursive: true });
      await writeFile(path.join(outputDirectory, "bunwire-pages-server.json"), JSON.stringify(pageServerManifest, null, 2), "utf8");
    },
    resolveId(id): string | undefined {
      if (id === BUNWIRE_REGISTRY_MODULE_ID) return BUNWIRE_RESOLVED_REGISTRY_MODULE_ID;
      if (id === BUNWIRE_CLIENT_MODULE_ID) return BUNWIRE_RESOLVED_CLIENT_MODULE_ID;
      if (id === BUNWIRE_PAGES_MODULE_ID) return BUNWIRE_RESOLVED_PAGES_MODULE_ID;
      return undefined;
    },
    async load(id): Promise<string | undefined> {
      if (id === BUNWIRE_RESOLVED_REGISTRY_MODULE_ID) return loadRegistry();
      if (id === BUNWIRE_RESOLVED_CLIENT_MODULE_ID) return loadClient();
      if (id === BUNWIRE_RESOLVED_PAGES_MODULE_ID) return loadPages();
      if (id.startsWith("\0") && isBunwireVirtualModuleId(id.slice(1))) {
        throw new BunwireCompilerError(
          "VIRTUAL_MODULE_INVALID",
          `Unknown Bunwire virtual module "${id.slice(1)}". Use "${BUNWIRE_REGISTRY_MODULE_ID}" for runtime metadata or "${BUNWIRE_CLIENT_MODULE_ID}" for caller contracts.`,
        );
      }
      return undefined;
    },
    async watchChange(id): Promise<void> {
      await refreshForWatchedChange(id, typeof this.addWatchFile === "function" ? this : undefined);
    },
    async handleHotUpdate(context): Promise<ModuleNode[] | undefined> {
      if (closing || !isRelevantChange(context.file)) return undefined;
      const affected = new Set(context.modules);
      try {
        await queueRefresh();
      } catch (cause) {
        await watchMissingProjectImports();
        throw cause;
      } finally {
        for (const module of invalidateVirtualModules(context.server)) affected.add(module);
      }
      return [...affected];
    },
    async closeBundle(): Promise<void> {
      if (!devServer) return;
      closing = true;
      await refreshQueue.catch(() => undefined);
      devServer = undefined;
    },
  };

  return plugin as BunwireVitePlugin;
}
