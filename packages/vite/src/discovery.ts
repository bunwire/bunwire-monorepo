import type { ResolvedBunwireConfig, LoadBunwireConfigOptions } from "./config.js";
import { loadBunwireConfig } from "./config.js";
import {
  discoverBootstrapAdapter,
  type DiscoveredAdapterReference,
} from "./bootstrap-discovery.js";
import {
  aggregateCompilerExtensions,
  type DiscoveredCompilerExtensions,
} from "./extensions.js";
import { discoverBunwireSourceFiles } from "./source-discovery.js";
import {
  analyzeBunwireProgram,
  type BunwireCompilerAnalysis,
} from "./compiler-analysis.js";
import type ts from "typescript";

export interface BunwireDiscoveryResult {
  readonly config: ResolvedBunwireConfig;
  readonly sourceFiles: readonly string[];
  readonly adapter: DiscoveredAdapterReference;
  readonly extensions: DiscoveredCompilerExtensions;
}

export interface AnalyzeBunwireApplicationOptions extends LoadBunwireConfigOptions {
  readonly tsconfigPath?: string;
  readonly compilerOptions?: ts.CompilerOptions;
}

export interface AnalyzedBunwireApplication extends BunwireDiscoveryResult {
  readonly analysis: BunwireCompilerAnalysis;
}

export async function discoverBunwireApplication(
  options: LoadBunwireConfigOptions = {},
): Promise<BunwireDiscoveryResult> {
  const config = await loadBunwireConfig(options);
  const [sourceFiles, adapter] = await Promise.all([
    discoverBunwireSourceFiles(config),
    discoverBootstrapAdapter(config.bootstrap),
  ]);
  const extensions = aggregateCompilerExtensions(adapter.compilerDescriptor);
  return Object.freeze({
    config,
    sourceFiles,
    adapter,
    extensions,
  });
}

export async function analyzeBunwireApplication(
  options: AnalyzeBunwireApplicationOptions = {},
): Promise<AnalyzedBunwireApplication> {
  const discovered = await discoverBunwireApplication(options);
  const analysis = analyzeBunwireProgram({
    projectRoot: discovered.config.root,
    sourceFiles: discovered.sourceFiles,
    extensions: discovered.extensions,
    ...(options.tsconfigPath ? { tsconfigPath: options.tsconfigPath } : {}),
    ...(options.compilerOptions ? { compilerOptions: options.compilerOptions } : {}),
  });
  return Object.freeze({ ...discovered, analysis });
}
