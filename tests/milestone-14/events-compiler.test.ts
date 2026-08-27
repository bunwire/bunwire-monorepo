import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import ts from "typescript";
import {
  AuditService,
  AuditUserRegistration,
  DecoratedEventChild,
  NothingObserved,
  UserRegistered,
} from "../fixtures/milestone-14-events/valid.js";
import {
  EVENT_KIND,
  Event,
  EventDispatcher,
  LISTENER_KIND,
  Listener,
  defineAdapterCompilerDescriptor,
  defineApp,
  defineClassKind,
  defineManagedClassDecorator,
  type RuntimeRegistry,
} from "@bunwire/core";
import {
  aggregateCompilerExtensions,
  analyzeBunwireProgram,
  generateRuntimeRegistryModule,
} from "@bunwire/vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/milestone-14-events");
const generatedPath = path.join(fixtureRoot, "registry.generated.ts");
const validPath = path.join(fixtureRoot, "valid.ts");
const extensions = aggregateCompilerExtensions(defineAdapterCompilerDescriptor({
  id: "fixture.core-events",
}));

function analyze(...files: string[]) {
  return analyzeBunwireProgram({
    projectRoot: repositoryRoot,
    sourceFiles: files.map((file) => path.join(fixtureRoot, file)),
    extensions,
    compilerOptions: {
      baseUrl: repositoryRoot,
      paths: { "@bunwire/core": ["packages/core/src/index.ts"] },
    },
  });
}

function analyzeValid() {
  return analyze("valid.ts");
}

function generate(analysis = analyzeValid()) {
  return generateRuntimeRegistryModule({
    analysis,
    extensions,
    modulePath: generatedPath,
  });
}

function expectFailure(file: string, code: string, message: RegExp): void {
  try {
    analyze(file);
  } catch (error) {
    expect(error).toMatchObject({
      code,
      message: expect.stringMatching(message),
      location: expect.objectContaining({
        filePath: expect.any(String),
        line: expect.any(Number),
        column: expect.any(Number),
      }),
    });
    return;
  }
  throw new Error(`Expected ${file} to fail with ${code}.`);
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

describe("Milestone 14 — canonical event/listener compiler analysis", () => {
  it("registers canonical Core descriptors and exact compiler exports", () => {
    expect(EVENT_KIND).toMatchObject({
      id: "core.event",
      injectable: false,
      autoDiscover: true,
      analyzeConstructor: false,
      managedMethods: false,
      registry: true,
    });
    expect(LISTENER_KIND).toMatchObject({
      id: "core.listener",
      injectable: true,
      autoDiscover: true,
      analyzeConstructor: true,
      managedMethods: true,
      registry: true,
    });
    expect(extensions.classDecorators).toContain(Event.definition);
    expect(extensions.classDecorators).toContain(Listener.definition);
    expect(Event.definition.compilerSymbol).toEqual({ moduleSpecifier: "@bunwire/core", exportName: "Event" });
    expect(Listener.definition.compilerSymbol).toEqual({ moduleSpecifier: "@bunwire/core", exportName: "Listener" });
  });

  it("compiles payload events, aliases, listener DI, intrinsic dispatcher DI, and inheritance rules", () => {
    const analysis = analyzeValid();
    const user = analysis.classes.find(({ name }) => name === "UserRegistered");
    const child = analysis.classes.find(({ name }) => name === "DecoratedEventChild");
    const listener = analysis.classes.find(({ name }) => name === "AuditUserRegistration");

    expect(user).toMatchObject({
      kind: EVENT_KIND,
      constructor: undefined,
      event: { alias: "user.registered" },
      methods: [],
    });
    expect(child?.event?.alias).toBeUndefined();
    expect(analysis.classes.some(({ name }) => name === "UndecoratedEventChild")).toBe(false);
    expect(analysis.classes.some(({ name }) => name === "UndecoratedListenerChild")).toBe(false);
    expect(listener).toMatchObject({
      kind: LISTENER_KIND,
      listener: { eventSymbolName: "UserRegistered" },
      constructor: { parameterCount: 2 },
      methods: [],
    });
    expect(listener?.constructor?.dependencies.map(({ index, token }) => ({
      index,
      symbol: token.symbolName,
      module: token.moduleSpecifier,
    }))).toEqual([
      { index: 0, symbol: "AuditService", module: undefined },
      { index: 1, symbol: "EventDispatcher", module: "@bunwire/core" },
    ]);
    expect(user?.decoratorId).toBe("core.event.decorator");
    expect(listener?.decoratorId).toBe("core.listener.decorator");
  });

  it("does not recognize unrelated same-name decorators and rejects same-ID counterfeits", () => {
    expect(analyze("fake-same-name.ts").classes).toEqual([]);
    expectFailure("invalid-counterfeit-event.ts", "DECORATOR_IDENTITY_CONFLICT", /core\.event\.decorator.*not the canonical/i);
    expectFailure("invalid-counterfeit-listener.ts", "DECORATOR_IDENTITY_CONFLICT", /core\.listener\.decorator.*not the canonical/i);
  });

  it("rejects a forged duplicate Core event class-kind descriptor", () => {
    const forgedKind = defineClassKind({
      id: "core.event",
      injectable: false,
      autoDiscover: true,
      analyzeConstructor: false,
      managedMethods: false,
      registry: true,
    });
    const forgedEvent = defineManagedClassDecorator<void, undefined, "fixture.forged-event">({
      id: "fixture.forged-event",
      compilerSymbol: { moduleSpecifier: "fixture.forged", exportName: "ForgedEvent" },
      kind: forgedKind,
      createMetadata: () => undefined,
    });
    expect(() => aggregateCompilerExtensions(defineAdapterCompilerDescriptor({
      id: "fixture.forged-event-adapter",
      classKinds: [forgedKind],
      classDecorators: [forgedEvent.definition],
    }))).toThrowError(expect.objectContaining({
      code: "EXTENSION_CONFLICT",
      message: expect.stringMatching(/core\.event.*different descriptor/i),
    }));
  });

  it.each([
    ["invalid-duplicate-alias.ts", "EVENT_ALIAS_INVALID", /alias.*both.*unique/i],
    ["invalid-event-alias.ts", "EVENT_ALIAS_INVALID", /protected non-static/i],
    ["invalid-undecorated-target.ts", "LISTENER_EVENT_INVALID", /canonically decorated.*Event/i],
    ["invalid-missing-handle.ts", "LISTENER_HANDLER_INVALID", /concrete callable.*handle/i],
    ["invalid-static-handle.ts", "LISTENER_HANDLER_INVALID", /concrete callable.*handle/i],
    ["invalid-overloaded-handle.ts", "LISTENER_HANDLER_INVALID", /without overloads/i],
    ["invalid-handler-event.ts", "LISTENER_HANDLER_INVALID", /type must resolve exactly/i],
    ["invalid-handler-shape.ts", "LISTENER_HANDLER_INVALID", /exactly one required/i],
    ["invalid-abstract-listener.ts", "LISTENER_CLASS_INVALID", /concrete.*abstract/i],
    ["invalid-unexported-event.ts", "EVENT_CLASS_INVALID", /exported directly/i],
  ] as const)("reports a source-located diagnostic for %s", (file, code, message) => {
    expectFailure(file, code, message);
  });
});

describe("Milestone 14 — generated event registry", () => {
  it("emits deterministic definitions, source-ordered relationships, and lexical aliases", () => {
    const first = generate();
    const analysis = analyzeValid();
    const reversed = generateRuntimeRegistryModule({
      analysis: Object.freeze({ ...analysis, classes: Object.freeze([...analysis.classes].reverse()) }),
      extensions,
      modulePath: generatedPath,
    });
    expect(reversed.code).toBe(first.code);
    expect(reversed.hash).toBe(first.hash);
    expect(first.code).toContain("defineListenerDefinition");
    expect(first.code).toContain("defineEventDefinition");
    expect(first.code.indexOf('defineEventAlias("audit.requested"')).toBeLessThan(
      first.code.indexOf('defineEventAlias("user.registered"'),
    );
    expect(first.code).toMatch(/defineEventDefinition\(\{ target: .*UserRegistered|defineEventDefinition/);
    expect(first.code).not.toMatch(/constructor\.name|\.name\s*===/);
  });

  it("generates TypeScript that passes a real semantic typecheck", () => {
    const program = ts.createProgram({
      rootNames: [generatedPath, validPath],
      options: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        experimentalDecorators: true,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        baseUrl: repositoryRoot,
        paths: { "@bunwire/core": ["packages/core/src/index.ts"] },
      },
    });
    expect(ts.getPreEmitDiagnostics(program).map((diagnostic) => (
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    ))).toEqual([]);
  });

  it("loads immutable canonical relationships and executes the behavioral fixture through DI", async () => {
    expect(generatedRegistry.events).toHaveLength(4);
    expect(generatedRegistry.eventAliases).toHaveLength(2);
    const user = generatedRegistry.events.find(({ target }) => target === UserRegistered);
    expect(user?.listeners.map(({ target }) => target.name)).toEqual([
      "InheritedAuditListener",
      "AuditUserRegistration",
      "DecoratedInheritedListener",
    ]);
    expect(generatedRegistry.eventAliases[1]).toEqual({
      alias: "user.registered",
      event: user,
    });
    expect(generatedRegistry.eventAliases.map(({ alias }) => alias)).toEqual([
      "audit.requested",
      "user.registered",
    ]);
    expect(Object.isFrozen(user)).toBe(true);
    expect(Object.isFrozen(user?.listeners)).toBe(true);
    expect(generatedRegistry.classes).toContain(user);
    expect(generatedRegistry.methods).toContain(user?.listeners[0]?.handle);

    const app = defineApp().withRuntimeRegistry(generatedRegistry);
    await app.start();
    const dispatcher = app.rootContainer.get(EventDispatcher);
    const event = new UserRegistered("123");
    await dispatcher.dispatch(event);
    expect(app.rootContainer.get(AuditService).records).toEqual([
      "base:123",
      "123",
      "nested:123",
      "base:123",
    ]);
    await expect(dispatcher.dispatch(new NothingObserved())).resolves.toBeUndefined();
    await expect(dispatcher.dispatch(new DecoratedEventChild("child"))).resolves.toBeUndefined();
    expect(app.rootContainer.get(AuditUserRegistration)).toBeInstanceOf(AuditUserRegistration);
  });

  it("contains no runtime source discovery or class-name identity", async () => {
    const sources = await Promise.all([
      "packages/core/src/events/dispatcher.ts",
      "packages/core/src/events/definitions.ts",
      "packages/core/src/application/application.ts",
    ].map((file) => fs.readFile(path.join(repositoryRoot, file), "utf8")));
    expect(sources.join("\n")).not.toMatch(/node:fs|typescript|readdir|glob/i);
    expect(generatedCode).not.toMatch(/node:fs|typescript|readdir|glob|constructor\.name/i);
  });
});
