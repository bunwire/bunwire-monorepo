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
  type BunwireSourceLocation,
} from "./diagnostics.js";
export {
  analyzeBunwireProgram,
  createBunwireProgram,
  type AnalyzedConstructorDependency,
  type AnalyzedConstructorPlan,
  type AnalyzedContainerParameter,
  type AnalyzedManagedClass,
  type AnalyzedManagedMethod,
  type AnalyzedMethodParameter,
  type AnalyzedResolverParameter,
  type AnalyzedTransportParameter,
  type BunwireAnalysisOptions,
  type BunwireCompilerAnalysis,
  type BunwireProgramContext,
  type BunwireProgramOptions,
  type CompilerRuntimeReference,
} from "./compiler-analysis.js";
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
  analyzeBunwireApplication,
  discoverBunwireApplication,
  type AnalyzeBunwireApplicationOptions,
  type AnalyzedBunwireApplication,
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
