import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BUN_COMPILER_DESCRIPTOR, BUN_HTTP_ROUTE_KIND, BunAdapter } from "@bunwire/bun";
import { Event, Listener, EVENT_KIND, LISTENER_KIND, EventDispatcher, defineApp, type RuntimeRegistry } from "@bunwire/core";
import { aggregateCompilerExtensions, analyzeBunwireProgram, generateBunwireArtifacts } from "@bunwire/vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuditLog, FirstObserver, WorkStarted, Unobserved, EventController } from "../../fixtures/bun-milestone-10/src/events.js";
import { fixtureRoot, generateFixture, repositoryRoot } from "./fixture.js";

const extensions = aggregateCompilerExtensions(BUN_COMPILER_DESCRIPTOR);
let generated: Awaited<ReturnType<typeof generateFixture>>;
let registry: RuntimeRegistry;
let code: string;

beforeAll(async () => {
  generated = await generateFixture();
  code = await readFile(generated.paths.registry, "utf8");
  registry = (await import(pathToFileURL(generated.paths.registry).href)).applicationRegistry as RuntimeRegistry;
});
afterAll(async () => { await generated?.dispose(); });

function analyze(file: string) {
  return analyzeBunwireProgram({
    projectRoot: repositoryRoot, sourceFiles: [file], extensions,
    compilerOptions: { baseUrl: repositoryRoot, paths: {
      "@bunwire/core": ["packages/core/src/index.ts"],
      "@bunwire/bun": ["packages/bun/src/index.ts"],
    } },
  });
}

describe("Bun Milestone 10 — compiled Core event integration", () => {
  it("uses Core identities once, including decorators imported through re-exports", () => {
    expect(extensions.classDecorators.filter((entry) => entry === Event.definition)).toHaveLength(1);
    expect(extensions.classDecorators.filter((entry) => entry === Listener.definition)).toHaveLength(1);
    expect(BUN_COMPILER_DESCRIPTOR.classKinds ?? []).not.toContain(EVENT_KIND);
    expect(BUN_COMPILER_DESCRIPTOR.classKinds ?? []).not.toContain(LISTENER_KIND);
    expect(registry.events.map((entry) => entry.target)).toContain(WorkStarted);
    expect(registry.events.find((entry) => entry.target === WorkStarted)?.kind).toBe(EVENT_KIND);
  });

  it("preserves canonical relationships, source order, lexical aliases, and constructor DI", () => {
    const event = registry.events.find((entry) => entry.target === WorkStarted)!;
    expect(event.listeners.map((entry) => entry.target.name)).toEqual(["FirstObserver", "SecondObserver"]);
    expect(registry.eventAliases.map((entry) => entry.alias)).toEqual(["work.observed", "work.started"]);
    expect(registry.eventAliases[1]?.event).toBe(event);
    expect(registry.classes).toContain(event);
    expect(Object.isFrozen(event.listeners)).toBe(true);
    expect(event.listeners[0]?.dependencies).toEqual([
      { index: 0, token: AuditLog }, { index: 1, token: EventDispatcher },
    ]);
    for (const listener of event.listeners) {
      expect(registry.classes).toContain(listener);
      expect(registry.methods).toContain(listener.handle);
    }
  });

  it("keeps listener plans out of native HTTP routes and caller contracts", async () => {
    const routes = registry.methods.filter((plan) => plan.kind === BUN_HTTP_ROUTE_KIND);
    expect(routes).toHaveLength(4);
    expect(routes.every((plan) => plan.target === EventController)).toBe(true);
    const client = await readFile(generated.paths.client, "utf8");
    expect(client).toContain("export interface BunwireRequestContract {}");
    expect(client).not.toMatch(/FirstObserver|WorkStarted|handle/);
    expect(code).not.toMatch(/readdir|glob|node:fs|constructor\.name/);
  });

  it("executes the generated registry through a Bun adapter without changing singleton listener defaults", async () => {
    const app = defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false }))
      .withRuntimeRegistry(registry);
    await app.start();
    try {
      const listener = app.rootContainer.get(FirstObserver);
      const dispatcher = app.rootContainer.get(EventDispatcher);
      await dispatcher.dispatch(new WorkStarted("compiled"));
      await dispatcher.dispatch(new Unobserved());
      expect(app.rootContainer.get(AuditLog).records).toEqual([
        "compiled:first", "compiled:nested", "compiled:after-nested", "compiled:second",
      ]);
      expect(app.rootContainer.get(FirstObserver)).toBe(listener);
    } finally { await app.stop(); }
  });

  it("does not authorize same-name fake decorators", () => {
    const classes = analyze(path.join(repositoryRoot, "tests/fixtures/milestone-14-events/fake-same-name.ts")).classes;
    expect(classes.filter((entry) => entry.kind === EVENT_KIND || entry.kind === LISTENER_KIND)).toEqual([]);
  });

  it("generates byte-stable event relationships and hashes on repeated discovery", async () => {
    const repeated = await generateBunwireArtifacts({
      root: fixtureRoot, generatedModulePath: generated.paths.registry,
      generatedClientModulePath: generated.paths.client, generatedDeclarationsPath: generated.paths.declarations,
    });
    expect(repeated.registryHash).toBe(generated.registryHash);
    expect(repeated.clientHash).toBe(generated.clientHash);
    expect(repeated.changedPaths).toEqual([]);
    expect(await readFile(generated.paths.registry, "utf8")).toBe(code);
  });

  it.each([
    ["invalid-counterfeit-event.ts", "DECORATOR_IDENTITY_CONFLICT"],
    ["invalid-counterfeit-listener.ts", "DECORATOR_IDENTITY_CONFLICT"],
    ["invalid-undecorated-target.ts", "LISTENER_EVENT_INVALID"],
    ["invalid-handler-event.ts", "LISTENER_HANDLER_INVALID"],
  ])("retains Core diagnostics for %s", (file, errorCode) => {
    expect(() => analyze(path.join(repositoryRoot, "tests/fixtures/milestone-14-events", file)))
      .toThrowError(expect.objectContaining({ code: errorCode, location: expect.objectContaining({ line: expect.any(Number) }) }));
  });

  it("rejects a canonical event omitted from the bounded managed source graph", () => {
    expect(() => analyze(path.join(fixtureRoot, "invalid-excluded-listener.ts")))
      .toThrowError(expect.objectContaining({ code: "LISTENER_EVENT_INVALID", message: expect.stringMatching(/registered class/i) }));
  });
});
