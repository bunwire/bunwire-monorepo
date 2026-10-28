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
  generateBunwireArtifactsFromApplication,
  resolveGeneratedArtifactPaths,
  type GenerateBunwireArtifactsOptions,
  type GeneratedBunwireArtifacts,
} from "./artifact-generator.js";
export {
  bunwireDiscoveryWatchedPaths,
  bunwireWatchedPaths,
  discoverMissingProjectImports,
  isBunwirePathWithin,
  isBunwireRelevantChange,
  missingProjectImportDirectories,
} from "./watch-inputs.js";
export {
  BUNWIRE_INSPECTION_COMMANDS,
  inspectBunwireApplication,
  inspectBunwireApplicationFromAnalysis,
  type BunwireInspectionCommand,
  type BunwireInspectionDetail,
  type BunwireInspectionItem,
  type BunwireInspectionLocation,
  type BunwireProjectInspection,
} from "./project-inspection.js";
export { resolveBunwireEventExport, type BunwireEventExport } from "./source-event-reference.js";
