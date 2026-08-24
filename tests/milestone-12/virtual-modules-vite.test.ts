import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createServer, type ViteDevServer } from "vite";
import {
  bunwire,
  generateBunwireArtifacts,
  type GeneratedBunwireArtifacts,
} from "@bunwire/vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceFixture = path.join(repositoryRoot, "tests/fixtures/milestone-12-electrobun");

function compilerOptions(): ts.CompilerOptions {
  return {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    experimentalDecorators: true,
    strict: true,
    exactOptionalPropertyTypes: true,
    noEmit: true,
    skipLibCheck: true,
    baseUrl: repositoryRoot,
    paths: {
      "@bunwire/core": ["packages/core/src/index.ts"],
      "@bunwire/vite": ["packages/vite/src/index.ts"],
      "@bunwire/electrobun": ["packages/electrobun/src/index.ts"],
    },
  };
}

async function waitFor(
  assertion: () => Promise<boolean>,
  message: string,
  timeout = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await assertion()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

async function waitForStableMtime(
  filePath: string,
  stableFor = 1_500,
  timeout = 60_000,
): Promise<number> {
  const deadline = Date.now() + timeout;
  let lastModified = (await fs.stat(filePath)).mtimeMs;
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    const modified = (await fs.stat(filePath)).mtimeMs;
    if (modified !== lastModified) {
      lastModified = modified;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= stableFor) {
      return modified;
    }
  }
  throw new Error(`Generated output "${filePath}" did not settle.`);
}

describe.sequential("prior-milestone closure — generated virtual modules", () => {
  let temporaryRoot: string;
  let artifacts: GeneratedBunwireArtifacts;
  let server: ViteDevServer | undefined;

  beforeAll(async () => {
    temporaryRoot = await fs.mkdtemp(path.join(repositoryRoot, ".tmp-bunwire-vite-"));
    await fs.cp(sourceFixture, temporaryRoot, { recursive: true });
    artifacts = await generateBunwireArtifacts({
      root: temporaryRoot,
      compilerOptions: compilerOptions(),
    });
  });

  afterAll(async () => {
    await server?.close();
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  });

  it("emits exact ambient declarations and avoids unchanged output churn", async () => {
    const consumerPath = path.join(temporaryRoot, "virtual-consumer.ts");
    await fs.writeFile(consumerPath, [
      'import registry, { applicationRegistry } from "virtual:bunwire/registry";',
      'import { createBunwireClient } from "virtual:bunwire/client";',
      "declare const transport: Parameters<typeof createBunwireClient>[0];",
      "const client = createBunwireClient(transport);",
      'client.request("users/get", "42", true);',
      'client.message("users/deleted", "42");',
      "// @ts-expect-error injected parameters are not caller-visible",
      'client.request("users/get", "42", {}, {}, {}, true);',
      "// @ts-expect-error caller id is required",
      'client.request("users/get");',
      "void registry;",
      "void applicationRegistry;",
      "",
    ].join("\n"), "utf8");

    const program = ts.createProgram({
      rootNames: [artifacts.paths.declarations, consumerPath],
      options: compilerOptions(),
    });
    expect(ts.getPreEmitDiagnostics(program).map((diagnostic) => (
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    ))).toEqual([]);

    const before = await Promise.all(Object.values(artifacts.paths).map(async (filePath) => ({
      filePath,
      modified: (await fs.stat(filePath)).mtimeMs,
    })));
    const unchanged = await generateBunwireArtifacts({
      root: temporaryRoot,
      compilerOptions: compilerOptions(),
    });
    expect(unchanged.changedPaths).toEqual([]);
    await expect(Promise.all(before.map(async ({ filePath, modified }) => (
      (await fs.stat(filePath)).mtimeMs === modified
    )))).resolves.toEqual([true, true, true]);
  });

  it("refreshes real Vite virtual modules for edits, additions, deletions, renames, and config changes", async () => {
    await fs.writeFile(path.join(temporaryRoot, "tsconfig.json"), JSON.stringify({
      compilerOptions: { experimentalDecorators: true, useDefineForClassFields: true },
    }), "utf8");
    server = await createServer({
      root: temporaryRoot,
      configFile: false,
      appType: "custom",
      resolve: {
        alias: {
          "@bunwire/core": path.join(repositoryRoot, "packages/core/src/index.ts"),
          "@bunwire/electrobun": path.join(repositoryRoot, "packages/electrobun/src/index.ts"),
        },
      },
      plugins: [bunwire({ root: temporaryRoot, compilerOptions: compilerOptions() })],
      server: { middlewareMode: true },
    });

    const firstClient = await server.transformRequest("virtual:bunwire/client");
    const firstRegistry = await server.transformRequest("virtual:bunwire/registry");
    expect(firstClient?.code).toContain('"users/get"');
    expect(firstRegistry?.code).toContain("defineRuntimeRegistry");

    const applicationPath = path.join(temporaryRoot, "src/bun/application.ts");
    const originalApplication = await fs.readFile(applicationPath, "utf8");
    await fs.writeFile(
      applicationPath,
      originalApplication.replace('@Route("get")', '@Route("getChanged")'),
      "utf8",
    );
    await waitFor(
      async () => (await fs.readFile(artifacts.paths.client, "utf8")).includes("users/getChanged"),
      "Vite did not refresh the generated client after a managed source edit.",
    );
    await waitFor(
      async () => (await server?.transformRequest("virtual:bunwire/client"))?.code
        .includes('"users/getChanged"') === true,
      "Vite did not invalidate the transformed client virtual module.",
    );

    const addedPath = path.join(temporaryRoot, "src/bun/added-service.ts");
    await fs.writeFile(addedPath, [
      'import { Service } from "@bunwire/core";',
      "@Service()",
      "export class AddedService {}",
      "",
    ].join("\n"), "utf8");
    await waitFor(
      async () => (await fs.readFile(artifacts.paths.registry, "utf8")).includes("AddedService"),
      "Vite did not discover a newly added managed source file.",
    );

    const renamedPath = path.join(temporaryRoot, "src/bun/renamed-service.ts");
    await fs.rename(addedPath, renamedPath);
    await waitFor(
      async () => (await fs.readFile(artifacts.paths.registry, "utf8")).includes("renamed-service.js"),
      "Vite did not refresh generated imports after a source rename.",
    );
    await fs.unlink(renamedPath);
    await waitFor(
      async () => !(await fs.readFile(artifacts.paths.registry, "utf8")).includes("AddedService"),
      "Vite did not remove a deleted managed source file.",
    );

    const extraRoot = path.join(temporaryRoot, "src/extra");
    await fs.mkdir(extraRoot, { recursive: true });
    await fs.writeFile(path.join(extraRoot, "extra-service.ts"), [
      'import { Service } from "@bunwire/core";',
      "@Service()",
      "export class ExtraService {}",
      "",
    ].join("\n"), "utf8");
    const configPath = path.join(temporaryRoot, "bunwire.config.ts");
    const originalConfig = await fs.readFile(configPath, "utf8");
    await fs.writeFile(
      configPath,
      originalConfig.replace('source: "./src/bun"', 'source: ["./src/bun", "./src/extra"]'),
      "utf8",
    );
    await waitFor(
      async () => (await fs.readFile(artifacts.paths.registry, "utf8")).includes("ExtraService"),
      "Vite did not recompute watched source roots after a config change.",
    );

    const declarationsModified = await waitForStableMtime(artifacts.paths.declarations);
    await fs.writeFile(path.join(temporaryRoot, "unrelated.txt"), "unrelated", "utf8");
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    expect((await fs.stat(artifacts.paths.declarations)).mtimeMs).toBe(declarationsModified);
  }, 240_000);
});
