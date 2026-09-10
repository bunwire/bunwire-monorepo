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
  resolveId(id: string): string | undefined;
  load(id: string): Promise<string | undefined>;
  watchChange(this: BunwirePluginContext, id: string): Promise<void>;
  handleHotUpdate(context: HmrContext): Promise<ModuleNode[] | undefined>;
}

interface BunwirePluginContext {
  addWatchFile(id: string): void;
  emitFile(file: Rollup.EmittedFile): string;
}

export type BunwireVitePlugin = Plugin & BunwirePluginHooks;

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`)
    && relative !== ".."
    && !path.isAbsolute(relative));
}

export function bunwire(options: BunwireVitePluginOptions = {}): BunwireVitePlugin {
  let viteRoot = path.resolve(options.root ?? process.cwd());
  let analyzedApplication: Promise<AnalyzedBunwireApplication> | undefined;
  let latestApplication: AnalyzedBunwireApplication | undefined;
  let devServer: ViteDevServer | undefined;
  let refreshQueue: Promise<unknown> = Promise.resolve();
  let generatedPaths = resolveGeneratedArtifactPaths(viteRoot, options);
  let resolvedViteConfig: ResolvedConfig | undefined;

  const outputPathIdentities = (): ReadonlySet<string> => new Set([
    generatedPaths.registry,
    generatedPaths.client,
    generatedPaths.declarations,
    generatedPaths.pages,
  ].filter((filePath): filePath is string => typeof filePath === "string")
    .map((filePath) => canonicalCompilerPath(filePath)));

  const analyze = (): Promise<AnalyzedBunwireApplication> => {
    analyzedApplication ??= analyzeBunwireApplication({
      ...options,
      root: options.root ? path.resolve(options.root) : viteRoot,
    }).then((application) => {
      latestApplication = application;
      generatedPaths = resolveGeneratedArtifactPaths(application.config.root, options);
      devServer?.watcher.add([
        application.config.configFile,
        application.config.bootstrap,
        ...application.config.sourceRoots,
      ]);
      return application;
    });
    return analyzedApplication;
  };

  const resetAnalysis = (): void => {
    analyzedApplication = undefined;
  };

  const watchedPaths = (application: AnalyzedBunwireApplication): readonly string[] => Object.freeze([
    application.config.configFile,
    application.config.bootstrap,
    ...application.config.sourceRoots,
    ...application.sourceFiles,
    ...(application.config.pages ? [application.config.pages.root, application.config.pages.entry] : []),
  ]);

  const registerWatchFiles = (
    context: BunwirePluginContext | undefined,
    application: AnalyzedBunwireApplication,
  ): void => {
    for (const filePath of watchedPaths(application)) context?.addWatchFile(filePath);
  };

  const refreshArtifacts = async (
    context?: BunwirePluginContext,
  ): Promise<AnalyzedBunwireApplication> => {
    const application = await analyze();
    registerWatchFiles(context, application);
    await generateBunwireArtifactsFromApplication(application, options);
    return application;
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

  const isRelevantChange = (filePath: string): boolean => {
    const resolved = path.resolve(filePath);
    const identity = canonicalCompilerPath(resolved);
    if (outputPathIdentities().has(identity)) return false;
    const application = latestApplication;
    if (!application) return isWithin(viteRoot, resolved);
    if (identity === canonicalCompilerPath(application.config.configFile)
      || identity === canonicalCompilerPath(application.config.bootstrap)) {
      return true;
    }
    return application.config.sourceRoots.some((root) => isWithin(root, resolved))
      || (application.config.pages !== undefined
        && (identity === canonicalCompilerPath(application.config.pages.entry)
          || isWithin(application.config.pages.root, resolved)));
  };

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
      if (latestApplication) server.watcher.add(watchedPaths(latestApplication));
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
        assetRoot: path.relative(application.config.root, resolvedViteConfig.build.outDir).replaceAll(path.sep, "/"),
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
      if (!isRelevantChange(id)) return;
      await queueRefresh(typeof this.addWatchFile === "function" ? this : undefined);
    },
    async handleHotUpdate(context): Promise<ModuleNode[] | undefined> {
      if (!isRelevantChange(context.file)) return undefined;
      await queueRefresh();
      const affected = new Set(context.modules);
      for (const id of [BUNWIRE_RESOLVED_REGISTRY_MODULE_ID, BUNWIRE_RESOLVED_CLIENT_MODULE_ID, BUNWIRE_RESOLVED_PAGES_MODULE_ID]) {
        const module = context.server.moduleGraph.getModuleById(id);
        if (!module) continue;
        context.server.moduleGraph.invalidateModule(module);
        affected.add(module);
      }
      return [...affected];
    },
  };

  return plugin as BunwireVitePlugin;
}
