import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateBunwireArtifacts } from "@bunwire/vite";

export const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/bun-milestone-10");

export async function generateFixture() {
  const directory = await mkdtemp(path.join(fixtureRoot, ".generated-"));
  try {
    const artifacts = await generateBunwireArtifacts({
      root: fixtureRoot,
      generatedModulePath: path.join(directory, "registry.ts"),
      generatedClientModulePath: path.join(directory, "client.ts"),
      generatedDeclarationsPath: path.join(directory, "virtual-modules.d.ts"),
    });
    return { ...artifacts, dispose: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
