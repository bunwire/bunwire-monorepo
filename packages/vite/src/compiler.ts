/** Public Node-compatible compiler and physical-artifact entrypoint. */
export {
  defineBunwireConfig,
  loadBunwireConfig,
  type BunwireConfig,
  type ResolvedBunwireConfig,
} from "./config.js";
export {
  BunwireCompilerError,
  type BunwireCompilerErrorCode,
  type BunwireRelatedLocation,
  type BunwireSourceLocation,
} from "./diagnostics.js";
export {
  analyzeBunwireApplication,
  discoverBunwireApplication,
  type AnalyzedBunwireApplication,
} from "./discovery.js";
export {
  generateBunwireArtifacts,
  type GenerateBunwireArtifactsOptions,
  type GeneratedBunwireArtifacts,
} from "./artifact-generator.js";
