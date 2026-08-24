import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import ts from "typescript";
import {
  Adapter,
  ContainerResolutionError,
  defineAdapterCompilerDescriptor,
  defineApp,
  defineParameterResolver,
  defineRuntimeRegistryConsumer,
  type ManagedMethodPlan,
  type RuntimeRegistry,
} from "@bunwire/core";
import {
  BUNWIRE_REGISTRY_MODULE_ID,
  BUNWIRE_RESOLVED_REGISTRY_MODULE_ID,
  BunwireCompilerError,
  aggregateCompilerExtensions,
  analyzeBunwireProgram,
  bunwire,
  generateRuntimeRegistryModule,
} from "@bunwire/vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CONSUMER_KIND,
  Consumer,
  FrameworkValue,
  SUBSCRIBE_KIND,
  Subscribe,
} from "../fixtures/milestone-8-analysis/extensions.js";
import {
  RegistryController,
  RegistryProvider,
} from "../fixtures/milestone-10-registry/app.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/milestone-10-registry");
const generatedPath = path.join(fixtureRoot, "registry.generated.ts");
const appPath = path.join(fixtureRoot, "app.ts");
const extensionPath = path.join(repositoryRoot, "tests/fixtures/milestone-8-analysis/extensions.ts");
const publicImportFixtureRoot = path.join(repositoryRoot, "tests/fixtures/prior-regression-imports");

const descriptor = defineAdapterCompilerDescriptor({
  id: "fixture.generated-host",
  classKinds: [CONSUMER_KIND],
  classDecorators: [Consumer.definition],
  methodKinds: [SUBSCRIBE_KIND],
  methodDecorators: [Subscribe.definition],
  parameterInjectors: [FrameworkValue.definition],
});
const extensions = aggregateCompilerExtensions(descriptor);

function analyze() {
  return analyzeBunwireProgram({
    projectRoot: repositoryRoot,
    sourceFiles: [appPath],
    extensions,
    compilerOptions: {
      baseUrl: repositoryRoot,
      paths: {
        "@bunwire/core": ["packages/core/src/index.ts"],
        "@bunwire/test-analysis-extensions": ["tests/fixtures/milestone-8-analysis/extensions.ts"],
      },
    },
  });
}

function generate(analysis = analyze()) {
  return generateRuntimeRegistryModule({
    analysis,
    extensions,
    modulePath: generatedPath,
  });
}

function analyzePublicImports() {
  return analyzeBunwireProgram({
    projectRoot: repositoryRoot,
    sourceFiles: [path.join(publicImportFixtureRoot, "application.ts")],
    extensions,
    compilerOptions: {
      baseUrl: repositoryRoot,
      paths: {
        "@bunwire/core": ["packages/core/src/index.ts"],
        "@bunwire/test-analysis-extensions": ["tests/fixtures/milestone-8-analysis/extensions.ts"],
        "@bunwire/prior-regression-public": ["tests/fixtures/prior-regression-imports/public.ts"],
      },
    },
  });
}

interface FixtureContext {
  readonly frameworkValue: { readonly source: string };
  readonly handlers: Map<string, (argumentsList: readonly unknown[]) => Promise<unknown>>;
}

const frameworkResolver = defineParameterResolver({
  id: "fixture.framework-value",
  resolve: ({ context }) => (context.applicationContext as FixtureContext).frameworkValue,
});

const registryConsumer = defineRuntimeRegistryConsumer<"fixture.generated-registry", FixtureContext>({
  id: "fixture.generated-registry",
  consume(registry, context): void {
    for (const plan of registry.methods) {
      const topic = (plan.data as { readonly topic: string }).topic;
      context.applicationContext.handlers.set(
        topic,
        (argumentsList) => context.invoke(plan, argumentsList),
      );
    }
  },
});

class FixtureAdapter extends Adapter<FixtureContext> {
  static readonly compiler = descriptor;

  constructor() {
    super({
      parameterResolvers: [frameworkResolver],
      registryConsumers: [registryConsumer],
    });
  }
}

let generatedRegistry: RuntimeRegistry;
let generatedCode: string;

beforeAll(async () => {
  const generated = generate();
  generatedCode = generated.code;
  await fs.writeFile(generatedPath, generated.code, "utf8");
  const loaded = await import(`${pathToFileURL(generatedPath).href}?hash=${generated.hash}`) as {
    readonly applicationRegistry: RuntimeRegistry;
  };
  generatedRegistry = loaded.applicationRegistry;
});

afterAll(async () => {
  await fs.unlink(generatedPath).catch(() => undefined);
});

describe("Milestone 10 — deterministic registry generation", () => {
  it("emits byte-stable imports, classes, Providers, constructor plans, methods, resolvers, middleware, and a hash", () => {
    const first = generate();
    const reversedAnalysis = analyze();
    const reversed = generateRuntimeRegistryModule({
      analysis: Object.freeze({
        ...reversedAnalysis,
        classes: Object.freeze([...reversedAnalysis.classes].reverse()),
      }),
      extensions,
      modulePath: generatedPath,
    });

    expect(reversed.code).toBe(first.code);
    expect(reversed.hash).toBe(first.hash);
    expect(first.code).toContain("defineRuntimeRegistry");
    expect(first.code).toContain("defineManagedMethodPlan");
    expect(first.code).toContain("providers: [");
    expect(first.code).toContain("dependencies: [{ index: 0, token:");
    expect(first.code).toContain('data: { "scope": "transient" }, scope: "transient"');
    expect(first.code).toContain('resolverId: createParameterResolverId("fixture.framework-value")');
    expect(first.code).toContain("middleware: []");
    expect(first.code).toContain("BUNWIRE_REGISTRY_HASH");
  });

  it("never executes Provider lifecycle while analyzing or generating", () => {
    RegistryProvider.registerCount = 0;
    RegistryProvider.bootCount = 0;
    generate();
    expect(RegistryProvider.registerCount).toBe(0);
    expect(RegistryProvider.bootCount).toBe(0);
  });

  it("generates TypeScript that passes a real semantic typecheck", () => {
    const program = ts.createProgram({
      rootNames: [generatedPath, appPath, extensionPath],
      options: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        experimentalDecorators: true,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        baseUrl: repositoryRoot,
        paths: {
          "@bunwire/core": ["packages/core/src/index.ts"],
          "@bunwire/test-analysis-extensions": ["tests/fixtures/milestone-8-analysis/extensions.ts"],
        },
      },
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    expect(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")))
      .toEqual([]);
  });

  it("rejects duplicate generated identities before emitting ambiguous output", () => {
    const analysis = analyze();
    expect(() => generateRuntimeRegistryModule({
      analysis: Object.freeze({
        ...analysis,
        classes: Object.freeze([...analysis.classes, analysis.classes[0] as typeof analysis.classes[number]]),
      }),
      extensions,
      modulePath: generatedPath,
    })).toThrowError(expect.objectContaining({
      code: "REGISTRY_GENERATION_INVALID",
      message: expect.stringMatching(/duplicate managed class identity/i),
    }));
  });

  it("retains named, default, and namespace public package export identities", () => {
    const analysis = analyzePublicImports();
    const dependencies = analysis.classes[0]?.constructor?.dependencies ?? [];

    expect(dependencies.map(({ token }) => ({
      moduleSpecifier: token.moduleSpecifier,
      exportName: token.exportName,
    }))).toEqual([
      { moduleSpecifier: "@bunwire/prior-regression-public", exportName: "PublicToken" },
      { moduleSpecifier: "@bunwire/prior-regression-public", exportName: "default" },
      { moduleSpecifier: "@bunwire/prior-regression-public", exportName: "PublicToken" },
    ]);

    const generated = generateRuntimeRegistryModule({
      analysis,
      extensions,
      modulePath: path.join(publicImportFixtureRoot, "registry.generated.ts"),
    });
    expect(generated.code).toMatch(
      /import \{ PublicToken as __bunwire_import_\d+ \} from "@bunwire\/prior-regression-public";/,
    );
    expect(generated.code).toMatch(
      /import \{ default as __bunwire_import_\d+ \} from "@bunwire\/prior-regression-public";/,
    );
  });

  it("uses host-aware case sensitivity for generated class identity", () => {
    const analysis = analyze();
    const original = analysis.classes[0] as typeof analysis.classes[number];
    const withPath = (filePath: string): typeof original => Object.freeze({
      ...original,
      target: Object.freeze({
        ...original.target,
        declaration: Object.freeze({ ...original.target.declaration, filePath }),
      }),
    });
    const caseAnalysis = Object.freeze({
      ...analysis,
      classes: Object.freeze([
        withPath(path.join(fixtureRoot, "Case.ts")),
        withPath(path.join(fixtureRoot, "case.ts")),
      ]),
    });
    const generateCaseVariant = () => generateRuntimeRegistryModule({
      analysis: caseAnalysis,
      extensions,
      modulePath: generatedPath,
    });

    if (ts.sys.useCaseSensitiveFileNames) {
      expect(generateCaseVariant).not.toThrow();
    } else {
      expect(generateCaseVariant).toThrow(/duplicate managed class identity/i);
    }
  });

  it("resolves only the established registry virtual module and rejects malformed Bunwire loads", async () => {
    const plugin = bunwire({ root: repositoryRoot });
    expect(plugin.resolveId(BUNWIRE_REGISTRY_MODULE_ID)).toBe(BUNWIRE_RESOLVED_REGISTRY_MODULE_ID);
    expect(plugin.resolveId("virtual:unrelated/module")).toBeUndefined();
    await expect(plugin.load("\0virtual:bunwire/not-a-registry"))
      .rejects.toMatchObject({ code: "VIRTUAL_MODULE_INVALID" });
    await expect(plugin.load("\0virtual:unrelated/module")).resolves.toBeUndefined();
  });

  it("loads deterministic registry source through the Vite virtual-module hook", async () => {
    const discoveryFixture = path.join(repositoryRoot, "tests/fixtures/milestone-7-discovery");
    const plugin = bunwire({
      root: discoveryFixture,
      configFile: "bunwire.config.ts",
      compilerOptions: {
        allowJs: true,
        baseUrl: repositoryRoot,
        paths: {
          "@bunwire/core": ["packages/core/src/index.ts"],
          "@bunwire/vite": ["packages/vite/src/index.ts"],
        },
      },
    });
    const first = await plugin.load(BUNWIRE_RESOLVED_REGISTRY_MODULE_ID);
    const cached = await plugin.load(BUNWIRE_RESOLVED_REGISTRY_MODULE_ID);

    expect(first).toContain("defineRuntimeRegistry");
    expect(cached).toBe(first);
  });
});

describe("Milestone 10 — generated registry runtime execution", () => {
  it("installs generated constructor metadata and constructs a Controller through the Container", async () => {
    const context: FixtureContext = { frameworkValue: { source: "resolver" }, handlers: new Map() };
    const app = defineApp()
      .withContext(context)
      .withAdapter(new FixtureAdapter())
      .withRuntimeRegistry(generatedRegistry);
    await app.start();

    const controller = app.rootContainer.get(RegistryController);
    expect(controller.service.name).toBe("generated-service");
  });

  it("executes fake-adapter metadata with interleaved caller/container/token/resolver parameters", async () => {
    RegistryProvider.registerCount = 0;
    RegistryProvider.bootCount = 0;
    const context: FixtureContext = { frameworkValue: { source: "resolver" }, handlers: new Map() };
    const app = defineApp()
      .withContext(context)
      .withAdapter(new FixtureAdapter())
      .withRuntimeRegistry(generatedRegistry);
    await app.start();

    const execute = context.handlers.get("registry.execute");
    expect(execute).toBeTypeOf("function");
    await expect(execute?.(["caller-id", "tail"])).resolves.toEqual({
      id: "caller-id",
      constructorService: "generated-service",
      service: "generated-service",
      value: "provider-value",
      frameworkValue: { source: "resolver" },
      suffix: "tail",
    });
    expect(RegistryProvider.registerCount).toBe(1);
    expect(RegistryProvider.bootCount).toBe(1);
  });

  it("runs generated Provider register once and boot once per invocation", async () => {
    RegistryProvider.registerCount = 0;
    RegistryProvider.bootCount = 0;
    const context: FixtureContext = { frameworkValue: { source: "resolver" }, handlers: new Map() };
    const app = defineApp()
      .withContext(context)
      .withAdapter(new FixtureAdapter())
      .withRuntimeRegistry(generatedRegistry);
    await app.start();
    const execute = context.handlers.get("registry.execute") as (args: readonly unknown[]) => Promise<unknown>;

    await execute(["one", "first"]);
    await execute(["two", "second"]);
    expect(RegistryProvider.registerCount).toBe(1);
    expect(RegistryProvider.bootCount).toBe(2);
  });

  it("reports a missing generated token through normal Container resolution diagnostics", async () => {
    const context: FixtureContext = { frameworkValue: { source: "resolver" }, handlers: new Map() };
    const app = defineApp()
      .withContext(context)
      .withAdapter(new FixtureAdapter())
      .withRuntimeRegistry(generatedRegistry);
    await app.start();
    const missing = context.handlers.get("registry.missing") as (args: readonly unknown[]) => Promise<unknown>;

    await expect(missing([])).rejects.toBeInstanceOf(ContainerResolutionError);
    await expect(missing([])).rejects.toThrow(/milestone-10-missing.*resolution chain/i);
  });

  it("keeps runtime registry validation authoritative for malformed generated-looking entries", async () => {
    const malformed = {
      ...generatedRegistry,
      classes: [{ ...generatedRegistry.classes[0], scope: "request" }],
      methods: [],
      providers: [],
    } as unknown as RuntimeRegistry;
    const context: FixtureContext = { frameworkValue: { source: "resolver" }, handlers: new Map() };
    const app = defineApp()
      .withContext(context)
      .withAdapter(new FixtureAdapter())
      .withRuntimeRegistry(malformed);
    await expect(app.start()).rejects.toThrow(/scope.*singleton.*transient/i);
  });

  it("contains no runtime filesystem scanner or compiler reclassification dependency", async () => {
    const runtimeFiles = [
      path.join(repositoryRoot, "packages/core/src/application/application.ts"),
      path.join(repositoryRoot, "packages/core/src/adapters/runtime-registry.ts"),
      path.join(repositoryRoot, "packages/core/src/managed-methods/invocation-engine.ts"),
    ];
    const sources = await Promise.all(runtimeFiles.map((file) => fs.readFile(file, "utf8")));
    expect(sources.join("\n")).not.toMatch(/node:fs|typescript|discoverBunwire|readdir|glob/i);
    expect(generatedCode).not.toMatch(/node:fs|typescript|readdir|glob/i);
  });
});
