import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BUNWIRE_DISCOVERY_MODULE_ID,
  BUNWIRE_RESOLVED_VIRTUAL_MODULE_PREFIX,
  BunwireCompilerError,
  aggregateCompilerExtensions,
  discoverBunwireApplication,
  discoverBunwireSourceFiles,
  isBunwireVirtualModuleId,
  loadBunwireConfig,
  resolveBunwireVirtualModuleId,
} from "@bunwire/vite";
import {
  SERVICE_KIND,
  defineAdapterCompilerDescriptor,
  defineClassKind,
  defineMethodKind,
} from "@bunwire/core";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/milestone-7-discovery");

function fixturePath(...segments: string[]): string {
  return path.join(fixtureRoot, ...segments);
}

async function expectCompilerError(
  operation: Promise<unknown>,
  code: BunwireCompilerError["code"],
): Promise<BunwireCompilerError> {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(BunwireCompilerError);
    expect(error).toMatchObject({ code });
    return error as BunwireCompilerError;
  }
  throw new Error(`Expected Bunwire compiler error ${code}.`);
}

async function productionFiles(root: string): Promise<readonly string[]> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)) {
        files.push(absolute);
      }
    }
  };
  await visit(root);
  return files.sort();
}

describe.sequential("Milestone 7 compiler discovery", () => {
  it("resolves source and bootstrap paths relative to the project root", async () => {
    const config = await loadBunwireConfig({ root: fixtureRoot });

    expect(config.root).toBe(fixtureRoot);
    expect(config.sourceRoots).toEqual([fixturePath("src/bun")]);
    expect(config.bootstrap).toBe(fixturePath("src/bun/bootstrap.ts"));
    expect(config.configFile).toBe(fixturePath("bunwire.config.ts"));
  });

  it("discovers multiple source files deterministically inside the bounded graph", async () => {
    const config = await loadBunwireConfig({ root: fixtureRoot });
    const expected = [
      fixturePath("src/bun/alpha.ts"),
      fixturePath("src/bun/bootstrap.ts"),
      fixturePath("src/bun/nested/middle.mts"),
      fixturePath("src/bun/zeta.ts"),
    ].sort();

    const first = await discoverBunwireSourceFiles(config);
    const second = await discoverBunwireSourceFiles(config);

    expect(first).toEqual(expected);
    expect(second).toEqual(first);
    expect(first).not.toContain(fixturePath("src/bun/ignored.d.ts"));
    expect(first).not.toContain(fixturePath("src/outside/ignored.ts"));
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("discovers the primary adapter and aggregates its compiler extensions", async () => {
    const result = await discoverBunwireApplication({ root: fixtureRoot });

    expect(result.adapter).toMatchObject({
      moduleSpecifier: "../../adapter/fake-adapter.mjs",
      exportName: "FixtureAdapter",
      localName: "HostAdapter",
    });
    expect(result.adapter.compilerDescriptor.id).toBe("fixture.host");
    expect(result.extensions.classKinds.map(({ id }) => id)).toEqual([
      "core.controller",
      "core.middleware",
      "core.provider",
      "core.service",
      "fixture.consumer",
    ]);
    expect(result.extensions.methodKinds.map(({ id }) => id)).toEqual([
      "fixture.subscribe",
    ]);
    expect(result.extensions.parameterInjectors.map(({ id }) => id)).toEqual([
      "fixture.delivery.decorator",
    ]);
    expect(result.extensions.metadataHandlers.map(({ id }) => id)).toEqual([
      "fixture.topic-metadata",
    ]);
  });

  it("resolves a package adapter through its ESM import export", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "bunwire-m7-esm-adapter-"));
    try {
      await mkdir(path.join(project, "src/bun"), { recursive: true });
      await mkdir(path.join(project, "node_modules/@fixture/esm-host"), { recursive: true });
      await writeFile(path.join(project, "bunwire.config.ts"), `
        export default defineBunwireConfig({
          source: "./src/bun",
          bootstrap: "./src/bun/bootstrap.ts",
        });
      `);
      await writeFile(path.join(project, "src/bun/bootstrap.ts"), `
        import { defineApp } from "@bunwire/core";
        import { EsmHostAdapter } from "@fixture/esm-host";
        export default defineApp().withAdapter(new EsmHostAdapter());
      `);
      await writeFile(path.join(project, "node_modules/@fixture/esm-host/package.json"), JSON.stringify({
        name: "@fixture/esm-host",
        type: "module",
        exports: { ".": { import: "./index.mjs" } },
      }));
      await writeFile(path.join(project, "node_modules/@fixture/esm-host/index.mjs"), `
        export class EsmHostAdapter {
          static compiler = Object.freeze({
            id: "fixture.esm-host",
            classKinds: Object.freeze([]),
            classDecorators: Object.freeze([]),
            methodKinds: Object.freeze([]),
            methodDecorators: Object.freeze([]),
            parameterInjectors: Object.freeze([]),
            metadataHandlers: Object.freeze([]),
          });
        }
      `);

      const result = await discoverBunwireApplication({ root: project });

      expect(result.adapter.moduleSpecifier).toBe("@fixture/esm-host");
      expect(result.adapter.resolvedModule).toBe(
        path.join(project, "node_modules/@fixture/esm-host/index.mjs"),
      );
      expect(result.adapter.compilerDescriptor.id).toBe("fixture.esm-host");
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("selects the ESM import condition when a package also exposes require", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "bunwire-m7-dual-adapter-"));
    try {
      await mkdir(path.join(project, "src/bun"), { recursive: true });
      await mkdir(path.join(project, "node_modules/@fixture/dual-host"), { recursive: true });
      await writeFile(path.join(project, "bunwire.config.ts"), `
        export default defineBunwireConfig({
          source: "./src/bun",
          bootstrap: "./src/bun/bootstrap.ts",
        });
      `);
      await writeFile(path.join(project, "src/bun/bootstrap.ts"), `
        import { defineApp } from "@bunwire/core";
        import { DualHostAdapter } from "@fixture/dual-host";
        export default defineApp().withAdapter(new DualHostAdapter());
      `);
      await writeFile(
        path.join(project, "node_modules/@fixture/dual-host/package.json"),
        JSON.stringify({
          name: "@fixture/dual-host",
          type: "module",
          exports: {
            ".": {
              import: "./import.mjs",
              require: "./require.cjs",
            },
          },
        }),
      );
      await writeFile(path.join(project, "node_modules/@fixture/dual-host/import.mjs"), `
        export class DualHostAdapter {
          static compiler = Object.freeze({
            id: "fixture.import-host",
            classKinds: Object.freeze([]),
            classDecorators: Object.freeze([]),
            methodKinds: Object.freeze([]),
            methodDecorators: Object.freeze([]),
            parameterInjectors: Object.freeze([]),
            metadataHandlers: Object.freeze([]),
          });
        }
      `);
      await writeFile(path.join(project, "node_modules/@fixture/dual-host/require.cjs"), `
        exports.DualHostAdapter = class DualHostAdapter {
          static compiler = Object.freeze({
            id: "fixture.require-host",
            classKinds: Object.freeze([]),
            classDecorators: Object.freeze([]),
            methodKinds: Object.freeze([]),
            methodDecorators: Object.freeze([]),
            parameterInjectors: Object.freeze([]),
            metadataHandlers: Object.freeze([]),
          });
        };
      `);

      const result = await discoverBunwireApplication({ root: project });

      expect(result.adapter.resolvedModule).toBe(
        path.join(project, "node_modules/@fixture/dual-host/import.mjs"),
      );
      expect(result.adapter.compilerDescriptor.id).toBe("fixture.import-host");
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("discovers only the adapter on the default-exported Application chain", async () => {
    const result = await discoverBunwireApplication({
      root: fixtureRoot,
      configFile: "bunwire.exported-chain.config.ts",
    });

    expect(result.adapter.exportName).toBe("FixtureAdapter");
    expect(result.adapter.compilerDescriptor.id).toBe("fixture.host");
  });

  it("does not treat an unused adapter call as the exported Application adapter", async () => {
    const error = await expectCompilerError(
      discoverBunwireApplication({
        root: fixtureRoot,
        configFile: "bunwire.unattached-adapter.config.ts",
      }),
      "ADAPTER_EXPRESSION_UNRESOLVABLE",
    );

    expect(error.message).toContain("must configure one primary adapter");
  });

  it("terminates contained directory-link cycles and emits each source once", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "bunwire-m7-source-cycle-"));
    const sourceRoot = path.join(project, "src");
    const link = path.join(sourceRoot, "nested", "back");
    try {
      await mkdir(path.dirname(link), { recursive: true });
      await writeFile(path.join(sourceRoot, "entry.ts"), "export const entry = true;");
      await symlink(sourceRoot, link, process.platform === "win32" ? "junction" : "dir");
      const canonicalProject = await realpath(project);
      const canonicalSource = await realpath(sourceRoot);

      const files = await discoverBunwireSourceFiles({
        root: canonicalProject,
        configFile: path.join(canonicalProject, "bunwire.config.ts"),
        sourceRoots: [canonicalSource],
        bootstrap: path.join(canonicalSource, "bootstrap.ts"),
      });

      expect(files).toEqual([path.join(canonicalSource, "entry.ts")]);
    } finally {
      await unlink(link).catch(() => undefined);
      await rm(project, { recursive: true, force: true });
    }
  });

  it("reports a typed diagnostic for a broken source-graph link", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "bunwire-m7-broken-link-"));
    const sourceRoot = path.join(project, "src");
    const target = path.join(sourceRoot, "target");
    const link = path.join(sourceRoot, "broken");
    try {
      await mkdir(target, { recursive: true });
      await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
      await rm(target, { recursive: true, force: true });
      const canonicalProject = await realpath(project);
      const canonicalSource = await realpath(sourceRoot);

      const error = await expectCompilerError(
        discoverBunwireSourceFiles({
          root: canonicalProject,
          configFile: path.join(canonicalProject, "bunwire.config.ts"),
          sourceRoots: [canonicalSource],
          bootstrap: path.join(canonicalSource, "bootstrap.ts"),
        }),
        "SOURCE_GRAPH_ESCAPE",
      );

      expect(error.message).toContain("broken or inaccessible");
      expect(error.filePath).toBe(link);
    } finally {
      await unlink(link).catch(() => undefined);
      await rm(project, { recursive: true, force: true });
    }
  });

  it("does not execute adapter construction, constructor options, or native callbacks", async () => {
    await discoverBunwireApplication({ root: fixtureRoot });
    const adapterModule = await import(
      pathToFileURL(fixturePath("adapter/fake-adapter.mjs")).href
    ) as {
      readonly fixtureState: {
        readonly moduleLoads: number;
        readonly constructions: number;
        readonly nativeCallbacks: number;
      };
    };

    expect(adapterModule.fixtureState.moduleLoads).toBeGreaterThanOrEqual(1);
    expect(adapterModule.fixtureState.constructions).toBe(0);
    expect(adapterModule.fixtureState.nativeCallbacks).toBe(0);
  });

  it("keeps runtime adapter configuration in the bootstrap composition root", async () => {
    const configText = await readFile(fixturePath("bunwire.config.ts"), "utf8");
    const bootstrapText = await readFile(fixturePath("src/bun/bootstrap.ts"), "utf8");

    expect(configText).not.toContain("FixtureAdapter");
    expect(configText).not.toContain("configure(");
    expect(bootstrapText).toContain("new HostAdapter(");
    expect(bootstrapText).toContain("configure(nativeHost");
  });

  it("reports an actionable diagnostic for an invalid source root", async () => {
    const error = await expectCompilerError(
      loadBunwireConfig({
        root: fixtureRoot,
        configFile: "bunwire.missing-source.config.ts",
      }),
      "SOURCE_ROOT_NOT_FOUND",
    );

    expect(error.message).toContain("does not exist");
    expect(error.message).toContain("bunwire.config");
    expect(error.filePath).toBe(fixturePath("src/does-not-exist"));
  });

  it("reports an actionable diagnostic for an invalid bootstrap path", async () => {
    const error = await expectCompilerError(
      loadBunwireConfig({
        root: fixtureRoot,
        configFile: "bunwire.missing-bootstrap.config.ts",
      }),
      "BOOTSTRAP_NOT_FOUND",
    );

    expect(error.message).toContain("does not exist");
    expect(error.message).toContain("bunwire.config");
    expect(error.filePath).toBe(fixturePath("src/bun/does-not-exist.ts"));
  });

  it("rejects config paths that escape the project root", async () => {
    const error = await expectCompilerError(
      loadBunwireConfig({
        root: fixtureRoot,
        configFile: "bunwire.escape.config.ts",
      }),
      "CONFIG_PATH_OUTSIDE_ROOT",
    );

    expect(error.message).toContain("outside project root");
  });

  it("rejects dynamic config instead of executing arbitrary config code", async () => {
    const error = await expectCompilerError(
      loadBunwireConfig({
        root: fixtureRoot,
        configFile: "bunwire.malformed.config.ts",
      }),
      "CONFIG_INVALID",
    );

    expect(error.message).toContain("string literal");
    expect(error.filePath).toBe(fixturePath("bunwire.malformed.config.ts"));
  });

  it("rejects an adapter factory without executing it", async () => {
    const error = await expectCompilerError(
      discoverBunwireApplication({
        root: fixtureRoot,
        configFile: "bunwire.unresolvable-adapter.config.ts",
      }),
      "ADAPTER_EXPRESSION_UNRESOLVABLE",
    );

    expect(error.message).toContain("direct \"new ImportedAdapter(...)\"");
    expect(error.message).toContain("without executing runtime configuration");
  });

  it("rejects an adapter class without its own static compiler descriptor", async () => {
    const error = await expectCompilerError(
      discoverBunwireApplication({
        root: fixtureRoot,
        configFile: "bunwire.missing-descriptor.config.ts",
      }),
      "ADAPTER_DESCRIPTOR_INVALID",
    );

    expect(error.message).toContain("own static compiler data property");
    expect(error.message).toContain("MissingCompilerAdapter");
  });

  it("does not let compiler extensions shadow canonical Core class-kind identities", () => {
    const shadowService = defineClassKind({
      id: "core.service",
      injectable: true,
      autoDiscover: true,
      analyzeConstructor: false,
      managedMethods: true,
    });
    const descriptor = defineAdapterCompilerDescriptor({
      id: "fixture.shadow-host",
      classKinds: [shadowService],
    });

    expect(() => aggregateCompilerExtensions(descriptor)).toThrowError(
      expect.objectContaining({
        code: "EXTENSION_CONFLICT",
        message: expect.stringContaining("core.service"),
      }),
    );
  });

  it("rejects duplicate compiler contribution IDs even when object identity matches", () => {
    const handler = Object.freeze({
      id: "fixture.duplicate-handler",
      data: Object.freeze({}),
    });
    const malformed = {
      id: "fixture.malformed-host",
      classKinds: [],
      classDecorators: [],
      methodKinds: [],
      methodDecorators: [],
      parameterInjectors: [],
      metadataHandlers: [handler, handler],
    } as never;

    expect(() => aggregateCompilerExtensions(malformed)).toThrowError(
      expect.objectContaining({
        code: "EXTENSION_CONFLICT",
        message: expect.stringContaining("contributed more than once"),
      }),
    );
  });

  it("rejects method kinds with unknown or method-disabled owners", () => {
    const missingOwner = defineClassKind({
      id: "fixture.missing-owner",
      injectable: true,
      autoDiscover: true,
      analyzeConstructor: true,
      managedMethods: true,
    });
    const unknownOwner = defineMethodKind({
      id: "fixture.unknown-owner-method",
      allowedOn: [missingOwner],
      invocable: true,
    });
    const serviceOwner = defineMethodKind({
      id: "fixture.service-method",
      allowedOn: [SERVICE_KIND],
      invocable: true,
    });

    for (const methodKind of [unknownOwner, serviceOwner]) {
      const descriptor = defineAdapterCompilerDescriptor({
        id: "fixture.invalid-owner-host",
        methodKinds: [methodKind],
      });
      expect(() => aggregateCompilerExtensions(descriptor)).toThrowError(
        expect.objectContaining({ code: "EXTENSION_CONFLICT" }),
      );
    }
  });

  it("reserves and resolves the virtual:bunwire/* module namespace", () => {
    expect(isBunwireVirtualModuleId("virtual:bunwire")).toBe(false);
    expect(isBunwireVirtualModuleId(BUNWIRE_DISCOVERY_MODULE_ID)).toBe(true);
    expect(isBunwireVirtualModuleId("virtual:other/discovery")).toBe(false);
    expect(resolveBunwireVirtualModuleId(BUNWIRE_DISCOVERY_MODULE_ID)).toBe(
      `${BUNWIRE_RESOLVED_VIRTUAL_MODULE_PREFIX}discovery`,
    );
    expect(resolveBunwireVirtualModuleId("virtual:other/discovery")).toBeUndefined();
  });

  it("keeps runtime packages free from filesystem source scanning", async () => {
    const runtimeRoots = [
      path.join(repositoryRoot, "packages/core/src"),
      path.join(repositoryRoot, "packages/electrobun/src"),
      path.join(repositoryRoot, "examples/electrobun-app/src"),
    ];

    for (const runtimeRoot of runtimeRoots) {
      for (const file of await productionFiles(runtimeRoot)) {
        const source = await readFile(file, "utf8");
        expect(source, file).not.toMatch(/from\s+["']node:(?:fs|path)["']/);
        expect(source, file).not.toMatch(/\b(?:readdir|glob|fastGlob|scanSource)\s*\(/);
      }
    }
  });
});
