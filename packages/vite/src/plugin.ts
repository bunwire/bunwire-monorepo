import path from "node:path";
import type { AnalyzeBunwireApplicationOptions } from "./discovery.js";
import { analyzeBunwireApplication } from "./discovery.js";
import { BunwireCompilerError } from "./diagnostics.js";
import { generateCallerContractModule } from "./caller-contract-generator.js";
import { generateRuntimeRegistryModule } from "./registry-generator.js";
import {
  BUNWIRE_CLIENT_MODULE_ID,
  BUNWIRE_REGISTRY_MODULE_ID,
  BUNWIRE_RESOLVED_CLIENT_MODULE_ID,
  BUNWIRE_RESOLVED_REGISTRY_MODULE_ID,
  isBunwireVirtualModuleId,
} from "./virtual-modules.js";

export interface BunwireVitePluginOptions extends AnalyzeBunwireApplicationOptions {
  readonly generatedModulePath?: string;
  readonly generatedClientModulePath?: string;
}

export interface BunwireVitePlugin {
  readonly name: "bunwire";
  readonly enforce: "pre";
  configResolved(config: { readonly root: string }): void;
  buildStart(): void;
  resolveId(id: string): string | undefined;
  load(id: string): Promise<string | undefined>;
}

export function bunwire(options: BunwireVitePluginOptions = {}): BunwireVitePlugin {
  let viteRoot = path.resolve(options.root ?? process.cwd());
  let analyzedApplication: ReturnType<typeof analyzeBunwireApplication> | undefined;

  const analyze = (): ReturnType<typeof analyzeBunwireApplication> => {
    analyzedApplication ??= analyzeBunwireApplication({
      ...options,
      root: options.root ? path.resolve(options.root) : viteRoot,
    });
    return analyzedApplication;
  };

  const loadRegistry = (): Promise<string> => {
    return analyze().then((application) => generateRuntimeRegistryModule({
      analysis: application.analysis,
      extensions: application.extensions,
      modulePath: path.resolve(
        options.generatedModulePath
          ?? path.join(application.config.root, ".bunwire", "registry.ts"),
      ),
      importMode: "vite",
    }).code);
  };

  const loadClient = (): Promise<string> => {
    return analyze().then((application) => generateCallerContractModule({
      analysis: application.analysis,
      extensions: application.extensions,
      modulePath: path.resolve(
        options.generatedClientModulePath
          ?? path.join(application.config.root, ".bunwire", "client.ts"),
      ),
      importMode: "vite",
    }).code);
  };

  return {
    name: "bunwire",
    enforce: "pre",
    configResolved(config): void {
      if (!options.root) viteRoot = path.resolve(config.root);
    },
    buildStart(): void {
      analyzedApplication = undefined;
    },
    resolveId(id): string | undefined {
      if (id === BUNWIRE_REGISTRY_MODULE_ID) {
        return BUNWIRE_RESOLVED_REGISTRY_MODULE_ID;
      }
      if (id === BUNWIRE_CLIENT_MODULE_ID) {
        return BUNWIRE_RESOLVED_CLIENT_MODULE_ID;
      }
      return undefined;
    },
    async load(id): Promise<string | undefined> {
      if (id === BUNWIRE_RESOLVED_REGISTRY_MODULE_ID) {
        return loadRegistry();
      }
      if (id === BUNWIRE_RESOLVED_CLIENT_MODULE_ID) {
        return loadClient();
      }
      if (id.startsWith("\0") && isBunwireVirtualModuleId(id.slice(1))) {
        throw new BunwireCompilerError(
          "VIRTUAL_MODULE_INVALID",
          `Unknown Bunwire virtual module "${id.slice(1)}". Use "${BUNWIRE_REGISTRY_MODULE_ID}" for runtime metadata or "${BUNWIRE_CLIENT_MODULE_ID}" for caller contracts.`,
        );
      }
      return undefined;
    },
  };
}
