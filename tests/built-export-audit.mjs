import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowlist = JSON.parse(await readFile(
  path.join(repositoryRoot, "tests/fixtures/milestone-13-public-exports.json"),
  "utf8",
));
const packageNames = ["core", "vite", "electrobun"];

for (const packageName of packageNames) {
  const packageRoot = path.join(repositoryRoot, "packages", packageName);
  const runtimePath = path.join(packageRoot, "dist/index.js");
  const declarationPath = path.join(packageRoot, "dist/index.d.ts");
  const runtime = await import(`${pathToFileURL(runtimePath).href}?audit=${Date.now()}`);
  const runtimeExports = Object.keys(runtime).sort();
  if (JSON.stringify(runtimeExports) !== JSON.stringify(allowlist[packageName].runtime)) {
    throw new Error(`Built runtime exports for @bunwire/${packageName} differ from the committed release allowlist.\nExpected: ${JSON.stringify(allowlist[packageName].runtime)}\nReceived: ${JSON.stringify(runtimeExports)}`);
  }

  const program = ts.createProgram({
    rootNames: [declarationPath],
    options: {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
    },
  });
  const sourceFile = program.getSourceFile(declarationPath);
  const moduleSymbol = sourceFile && program.getTypeChecker().getSymbolAtLocation(sourceFile);
  if (!sourceFile || !moduleSymbol) {
    throw new Error(`Unable to inspect declarations for @bunwire/${packageName}.`);
  }
  const declarationExports = program.getTypeChecker().getExportsOfModule(moduleSymbol)
    .map((symbol) => symbol.name)
    .sort();
  if (JSON.stringify(declarationExports) !== JSON.stringify(allowlist[packageName].declarations)) {
    throw new Error(`Built declaration exports for @bunwire/${packageName} differ from the committed release allowlist.\nExpected: ${JSON.stringify(allowlist[packageName].declarations)}\nReceived: ${JSON.stringify(declarationExports)}`);
  }
}

const corePath = path.join(repositoryRoot, "packages/core/dist/index.js");
const coreTypesPath = path.join(repositoryRoot, "packages/core/dist/index.d.ts");
const core = await import(`${pathToFileURL(corePath).href}?audit=${Date.now()}`);
const removedType = ["Managed", "Method", "Middleware"].join("");

if (removedType in core) throw new Error(`Removed middleware callback export ${removedType} remains in Core dist.`);
for (const name of ["Middleware", "Use", "defineMiddlewareAttachment", "executeMiddlewareChain"]) {
  if (!(name in core)) throw new Error(`Expected Core dist export ${name} is missing.`);
}

const coreTypes = await readFile(coreTypesPath, "utf8");
if (coreTypes.includes(removedType)) {
  throw new Error(`Removed middleware callback type ${removedType} remains in Core declarations.`);
}

console.log("Built public runtime/declaration export allowlists passed for all release packages.");
