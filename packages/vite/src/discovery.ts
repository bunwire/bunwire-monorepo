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

export interface BunwireDiscoveryResult {
  readonly config: ResolvedBunwireConfig;
  readonly sourceFiles: readonly string[];
  readonly adapter: DiscoveredAdapterReference;
  readonly extensions: DiscoveredCompilerExtensions;
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
