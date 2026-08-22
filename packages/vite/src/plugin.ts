import path from "node:path";
import type { AnalyzeBunwireApplicationOptions } from "./discovery.js";
import { analyzeBunwireApplication } from "./discovery.js";
import { BunwireCompilerError } from "./diagnostics.js";
import { generateRuntimeRegistryModule } from "./registry-generator.js";
import {
  BUNWIRE_REGISTRY_MODULE_ID,
  BUNWIRE_RESOLVED_REGISTRY_MODULE_ID,
  isBunwireVirtualModuleId,
} from "./virtual-modules.js";

export interface BunwireVitePluginOptions extends AnalyzeBunwireApplicationOptions {
  readonly generatedModulePath?: string;
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
  let generatedCode: Promise<string> | undefined;

  const loadRegistry = (): Promise<string> => {
    generatedCode ??= analyzeBunwireApplication({
      ...options,
      root: options.root ? path.resolve(options.root) : viteRoot,
    }).then((application) => generateRuntimeRegistryModule({
      analysis: application.analysis,
      extensions: application.extensions,
      modulePath: path.resolve(
        options.generatedModulePath
          ?? path.join(application.config.root, ".bunwire", "registry.ts"),
      ),
      importMode: "vite",
    }).code);
    return generatedCode;
  };

  return {
    name: "bunwire",
    enforce: "pre",
    configResolved(config): void {
      if (!options.root) viteRoot = path.resolve(config.root);
    },
    buildStart(): void {
      generatedCode = undefined;
    },
    resolveId(id): string | undefined {
      if (id === BUNWIRE_REGISTRY_MODULE_ID) {
        return BUNWIRE_RESOLVED_REGISTRY_MODULE_ID;
      }
      return undefined;
    },
    async load(id): Promise<string | undefined> {
      if (id === BUNWIRE_RESOLVED_REGISTRY_MODULE_ID) {
        return loadRegistry();
      }
      if (id.startsWith("\0") && isBunwireVirtualModuleId(id.slice(1))) {
        throw new BunwireCompilerError(
          "VIRTUAL_MODULE_INVALID",
          `Unknown Bunwire virtual module "${id.slice(1)}". Use "${BUNWIRE_REGISTRY_MODULE_ID}" for generated runtime metadata.`,
        );
      }
      return undefined;
    },
  };
}
