import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { runBunwireCli } from "@bunwire/cli";
import { analyzeBunwireApplication } from "@bunwire/vite/compiler";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const temporary: string[] = [];

async function fixture(source: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(repositoryRoot, ".tmp-bunwire-m26-"));
  temporary.push(root);
  await fs.cp(path.join(repositoryRoot, source, "src"), path.join(root, "src"), { recursive: true });
  await fs.copyFile(path.join(repositoryRoot, source, "bunwire.config.ts"), path.join(root, "bunwire.config.ts"));
  await fs.writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { experimentalDecorators: true } }));
  return root;
}

async function run(root: string, ...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runBunwireCli(args, { cwd: root, io: { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) } });
  return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

afterEach(async () => {
  for (const root of temporary.splice(0)) {
    if (path.dirname(root) !== repositoryRoot || !path.basename(root).startsWith(".tmp-bunwire-m26-")) throw new Error("Unsafe fixture cleanup path.");
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe.sequential("Milestone 26 — Core source generators", () => {
  for (const [label, sourceRoot, source] of [
    ["Bun", "src", "examples/bun-app"],
    ["Electrobun", "src/bun", "tests/fixtures/milestone-12-electrobun"],
  ] as const) {
    it(`creates and discovers six compiling Core types in ${label}`, async () => {
      const root = await fixture(source);
      const bootstrap = await fs.readFile(path.join(root, sourceRoot, "bootstrap.ts"), "utf8");
      const marker = path.join(root, "startup-marker.txt");
      await fs.appendFile(path.join(root, sourceRoot, "bootstrap.ts"), `\nthrow new Error("Generator imported bootstrap");\n`);
      for (const [kind, name] of [
        ["controller", "NewController"], ["service", "NewService"], ["provider", "NewProvider"],
        ["middleware", "NewMiddleware"], ["event", "NewEvent"],
      ] as const) {
        const args = kind === "middleware" ? ["--alias", "new-middleware"] : [];
        const result = await run(root, `make:${kind}`, name, ...args);
        expect(result.code, result.stderr).toBe(0);
      }
      const eventFile = `${sourceRoot}/events/new-event.ts`;
      const listener = await run(root, "make:listener", "NewListener", "--event", `${eventFile}#NewEvent`);
      expect(listener.code, listener.stderr).toBe(0);
      const analyzed = await analyzeBunwireApplication({ root });
      for (const [name, kind] of [
        ["NewController", "core.controller"], ["NewService", "core.service"], ["NewProvider", "core.provider"],
        ["NewMiddleware", "core.middleware"], ["NewEvent", "core.event"], ["NewListener", "core.listener"],
      ]) {
        expect(analyzed.analysis.classes.some((entry) => entry.name === name && entry.kind.id === kind), name).toBe(true);
      }
      const generated = analyzed.analysis.classes.filter((entry) => entry.name.startsWith("New"));
      const diagnostics = ts.getPreEmitDiagnostics(analyzed.analysis.context.program).filter((entry) =>
        entry.file && generated.some((item) => item.location.filePath === entry.file?.fileName),
      );
      expect(diagnostics.map((entry) => ts.flattenDiagnosticMessageText(entry.messageText, "\n"))).toEqual([]);
      const middleware = await fs.readFile(path.join(root, sourceRoot, "middleware/new-middleware.ts"), "utf8");
      expect(middleware).toContain("implements Middleware");
      expect(middleware).toContain("next: MiddlewareNext");
      const event = generated.find((entry) => entry.name === "NewEvent")!;
      const target = generated.find((entry) => entry.name === "NewListener")!.listener!.event;
      expect(target.declaration.filePath).toBe(event.target.declaration.filePath);
      expect(target.symbolName).toBe(event.target.symbolName);
      expect(await fs.readFile(path.join(root, sourceRoot, "bootstrap.ts"), "utf8")).toBe(`${bootstrap}\nthrow new Error("Generator imported bootstrap");\n`);
      expect(await fs.stat(marker).then(() => true, () => false)).toBe(false);
      expect(await fs.stat(path.join(root, ".bunwire")).then(() => true, () => false)).toBe(false);
    }, 180_000);
  }

  it("rejects invalid names, Event targets, ambiguous roots, and existing files without damage", async () => {
    const root = await fixture("tests/fixtures/milestone-12-electrobun");
    for (const name of ["../Escape", "lowercase", "Foo/Bar", "A-B", "class"] as const) {
      expect((await run(root, "make:service", name)).code).toBe(1);
    }
    expect((await run(root, "make:service", "GoodService", "--source", "../outside")).code).toBe(1);
    expect((await run(root, "make:middleware", "AnotherMiddleware", "--alias", "auth:admin")).code).toBe(1);
    expect((await run(root, "make:listener", "SomeListener")).stderr).toContain("--event");
    expect((await run(root, "make:listener", "SomeListener", "--event", "src/bun/application.ts#UserService")).code).toBe(1);
    expect((await run(root, "make:listener", "SomeListener", "--event", "../outside.ts#Event")).code).toBe(1);
    expect((await run(root, "make:middleware", "AnotherMiddleware", "--alias", "logging")).stderr).toContain("already defined");
    const first = await run(root, "make:service", "GoodService");
    expect(first.code, first.stderr).toBe(0);
    const destination = path.join(root, "src/bun/services/good-service.ts");
    const original = await fs.readFile(destination, "utf8");
    const second = await run(root, "make:service", "GoodService");
    expect(second.code).toBe(1);
    expect(await fs.readFile(destination, "utf8")).toBe(original);

    await fs.writeFile(path.join(root, "bunwire.config.ts"), 'export default { source: ["./src/bun", "./src"], bootstrap: "./src/bun/bootstrap.ts" };\n');
    expect((await run(root, "make:service", "AnotherService")).stderr).toContain("multiple source roots");
    const selected = await run(root, "make:service", "AnotherService", "--source", "src/bun");
    expect(selected.code, selected.stderr).toBe(0);
    expect((await run(root, "help", "make:listener")).stdout).toContain("--event project-relative-file#ExportName");
    expect((await run(root, "list")).stdout).toContain("make:middleware");
  }, 180_000);

  it("resolves an Event re-export by the named export selected by the caller", async () => {
    const root = await fixture("tests/fixtures/milestone-12-electrobun");
    expect((await run(root, "make:event", "OriginalEvent")).code).toBe(0);
    await fs.writeFile(path.join(root, "src/bun/event-barrel.ts"),
      'export { OriginalEvent as SelectedEvent } from "./events/original-event.js";\n');
    const result = await run(root, "make:listener", "SelectedListener", "--event", "src/bun/event-barrel.ts#SelectedEvent");
    expect(result.code, result.stderr).toBe(0);
    const listener = await fs.readFile(path.join(root, "src/bun/listeners/selected-listener.ts"), "utf8");
    expect(listener).toContain('import { SelectedEvent as __BunwireEvent } from "../event-barrel.js";');
    const analyzed = await analyzeBunwireApplication({ root });
    const event = analyzed.analysis.classes.find((entry) => entry.name === "OriginalEvent")!;
    const target = analyzed.analysis.classes.find((entry) => entry.name === "SelectedListener")!.listener!.event;
    expect(target.declaration.filePath).toBe(event.target.declaration.filePath);
  }, 90_000);
});
