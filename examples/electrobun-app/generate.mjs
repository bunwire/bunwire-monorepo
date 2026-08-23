import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  analyzeBunwireApplication,
  generateCallerContractModule,
  generateRuntimeRegistryModule,
} from "@bunwire/vite";

const root = import.meta.dirname;
const generatedDirectory = path.join(root, ".bunwire");
const registryPath = path.join(generatedDirectory, "registry.ts");
const clientPath = path.join(generatedDirectory, "client.ts");
const application = await analyzeBunwireApplication({ root });
const registry = generateRuntimeRegistryModule({
  analysis: application.analysis,
  extensions: application.extensions,
  modulePath: registryPath,
});
const client = generateCallerContractModule({
  analysis: application.analysis,
  extensions: application.extensions,
  modulePath: clientPath,
});

await mkdir(generatedDirectory, { recursive: true });
await Promise.all([
  writeFile(registryPath, registry.code, "utf8"),
  writeFile(clientPath, client.code, "utf8"),
]);
