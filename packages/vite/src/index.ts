export {
  defineBunwireConfig,
  loadBunwireConfig,
  type BunwireConfig,
  type LoadBunwireConfigOptions,
  type ResolvedBunwireConfig,
} from "./config.js";
export {
  BunwireCompilerError,
  type BunwireCompilerErrorCode,
  type BunwireCompilerErrorOptions,
} from "./diagnostics.js";
export { discoverBunwireSourceFiles } from "./source-discovery.js";
export {
  discoverBootstrapAdapter,
  type DiscoveredAdapterReference,
} from "./bootstrap-discovery.js";
export {
  aggregateCompilerExtensions,
  type DiscoveredCompilerExtensions,
} from "./extensions.js";
export {
  discoverBunwireApplication,
  type BunwireDiscoveryResult,
} from "./discovery.js";
export {
  BUNWIRE_DISCOVERY_MODULE_ID,
  BUNWIRE_RESOLVED_VIRTUAL_MODULE_PREFIX,
  BUNWIRE_VIRTUAL_MODULE_NAMESPACE,
  BUNWIRE_VIRTUAL_MODULE_PREFIX,
  isBunwireVirtualModuleId,
  resolveBunwireVirtualModuleId,
} from "./virtual-modules.js";
