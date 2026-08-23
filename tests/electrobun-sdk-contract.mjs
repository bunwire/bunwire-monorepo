import path from "node:path";
import process from "node:process";
import ts from "typescript";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const contractPath = path.join(
  repositoryRoot,
  "tests/fixtures/milestone-11-electrobun/sdk-contract.ts",
);
const clientContractPath = path.join(
  repositoryRoot,
  "tests/fixtures/milestone-12-electrobun/sdk-client-contract.ts",
);
const program = ts.createProgram({
  rootNames: [contractPath, clientContractPath],
  options: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    exactOptionalPropertyTypes: false,
    noEmit: true,
    skipLibCheck: true,
    baseUrl: repositoryRoot,
    paths: {
      "@bunwire/core": ["packages/core/src/index.ts"],
      "@bunwire/electrobun": ["packages/electrobun/src/index.ts"],
    },
  },
});

const normalizedContractPaths = new Set([
  path.normalize(contractPath),
  path.normalize(clientContractPath),
]);
const diagnostics = ts.getPreEmitDiagnostics(program).filter(
  (diagnostic) => diagnostic.file && normalizedContractPaths.has(path.normalize(diagnostic.file.fileName)),
);

if (diagnostics.length > 0) {
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => repositoryRoot,
    getNewLine: () => "\n",
  }));
  process.exitCode = 1;
} else {
  process.stdout.write("Electrobun 1.18.1 SDK contract is compatible.\n");
}
