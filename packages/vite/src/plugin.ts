import path from "node:path";
import type {
  HmrContext,
  ModuleNode,
  Plugin,
  ResolvedConfig,
  ViteDevServer,
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
  BUNWIRE_CLIENT_MODULE_ID,
  BUNWIRE_REGISTRY_MODULE_ID,
  BUNWIRE_RESOLVED_CLIENT_MODULE_ID,
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
  resolveId(id: string): string | undefined;
  load(id: string): Promise<string | undefined>;
  watchChange(this: BunwirePluginContext, id: string): Promise<void>;
  handleHotUpdate(context: HmrContext): Promise<ModuleNode[] | undefined>;
}

interface BunwirePluginContext {
  addWatchFile(id: string): void;
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

  const outputPathIdentities = (): ReadonlySet<string> => new Set([
    generatedPaths.registry,
    generatedPaths.client,
    generatedPaths.declarations,
  ].map((filePath) => canonicalCompilerPath(filePath)));

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
    return application.config.sourceRoots.some((root) => isWithin(root, resolved));
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

  const plugin: BunwirePluginHooks = {
    name: "bunwire",
    enforce: "pre",
    configResolved(config): void {
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
    resolveId(id): string | undefined {
      if (id === BUNWIRE_REGISTRY_MODULE_ID) return BUNWIRE_RESOLVED_REGISTRY_MODULE_ID;
      if (id === BUNWIRE_CLIENT_MODULE_ID) return BUNWIRE_RESOLVED_CLIENT_MODULE_ID;
      return undefined;
    },
    async load(id): Promise<string | undefined> {
      if (id === BUNWIRE_RESOLVED_REGISTRY_MODULE_ID) return loadRegistry();
      if (id === BUNWIRE_RESOLVED_CLIENT_MODULE_ID) return loadClient();
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
      for (const id of [BUNWIRE_RESOLVED_REGISTRY_MODULE_ID, BUNWIRE_RESOLVED_CLIENT_MODULE_ID]) {
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
