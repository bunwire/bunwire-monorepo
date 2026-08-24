import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

console.log("Built public middleware export audit passed.");
