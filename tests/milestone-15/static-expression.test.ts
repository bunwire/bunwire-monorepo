import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";
import { StaticExpressionResolver, STATIC_LIMITS, type StaticValue } from "../../packages/vite/src/static-expression.js";
import { canonicalCompilerPath } from "../../packages/vite/src/path-identity.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const fixtures = path.join(repo, "tests/fixtures/milestone-15-static-expressions");
const temporary: string[] = [];
const compilerOptions: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext, noLib: true, types: [] };
const program = ts.createProgram([path.join(fixtures, "expressions.ts"), path.join(fixtures, "invalid.ts")], compilerOptions);

function expression(program: ts.Program, name: string): ts.Expression {
  let result: ts.Expression | undefined;
  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) result = node.initializer;
    ts.forEachChild(node, visit);
  }
  for (const source of program.getSourceFiles()) visit(source);
  if (!result) throw new Error(`Missing fixture expression ${name}`);
  return result;
}

function plain(value: StaticValue): unknown {
  switch (value.kind) {
    case "scalar": return value.value;
    case "reference": return value.symbol;
    case "array": return value.items.map(plain);
    case "object": return Object.fromEntries(Object.entries(value.properties).map(([key, item]) => [key, plain(item)]));
  }
}

function resolve(name: string) {
  return new StaticExpressionResolver({ program, projectRoot: fixtures }).resolve(expression(program, name));
}

function setup(source: string, extra: Record<string, string> = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "bunwire-static-")); temporary.push(root);
  writeFileSync(path.join(root, "entry.ts"), source);
  for (const [name, contents] of Object.entries(extra)) writeFileSync(path.join(root, name), contents);
  const program = ts.createProgram([path.join(root, "entry.ts")], compilerOptions);
  return { root, program, resolver: new StaticExpressionResolver({ program, projectRoot: root }),
    expression: (name = "result") => expression(program, name) };
}

afterAll(() => { for (const root of temporary) rmSync(root, { recursive: true, force: true }); });

describe("Milestone 15 static expression resolver", () => {
  it("resolves primitives, numeric separators, wrappers, operators, and lexical shadowing", () => {
    expect(plain(resolve("primitive").value)).toEqual(["a", 1000, true, false, null, undefined]);
    expect(plain(resolve("wrappers").value)).toEqual({ n: 2 });
    expect(plain(resolve("typeAssertion").value)).toEqual({ n: 2 });
    expect(plain(resolve("operators").value)).toEqual([2, -2, 3, 2, 8, 4, 2, 8, "ab"]);
    expect(plain(resolve("shadowResult").value)).toEqual(["inner", "shadowed"]);
  });

  it("resolves collections, overwrite order, computed keys, and own reads safely", () => {
    expect(plain(resolve("spread").value)).toEqual({ a: 2, b: 3, cd: [0, 1, 2], 4: "four" });
    const special = resolve("special").value;
    expect(special.kind === "object" && Object.getPrototypeOf(special.properties)).toBe(null);
    expect(plain(resolve("special").value)).toEqual(JSON.parse('{"__proto__":"safe","constructor":2,"toString":3}'));
    expect(plain(resolve("own").value)).toBe("safe");
    expect(plain(resolve("arrayRead").value)).toBe(4);
    expect(plain(resolve("arrayLength").value)).toBe(2);
  });

  it("follows aliases, namespace members, named and star re-exports with complete provenance", () => {
    const result = resolve("imported");
    expect(plain(result.value)).toEqual({ queue: "billing", timeout: 60000, backoff: [1000, 5000, 30000, 90000], name: "billing" });
    expect(result.dependencies.map((file) => path.basename(file)).sort()).toEqual(["barrel.ts", "constants.ts", "expressions.ts", "star.ts"]);
    expect(new Set(result.provenance.map((at) => path.basename(at.filePath)))).toEqual(new Set(["barrel.ts", "constants.ts", "expressions.ts", "star.ts"]));
    expect(plain(resolve("namespaceComputed").value)).toBe("billing");
    expect(plain(resolve("aliases").value)).toEqual(["billing", "billing"]);
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  it("keeps canonical classes and authorized tokens distinct from ordinary data", () => {
    const checker = program.getTypeChecker();
    const token = checker.getSymbolAtLocation((expression(program, "TOKEN").parent as ts.VariableDeclaration).name)!;
    const resolver = new StaticExpressionResolver({ program, projectRoot: fixtures, isCanonicalReference: (symbol) => symbol === token });
    const result = resolver.resolve(expression(program, "references")).value;
    expect(result.kind).toBe("array");
    if (result.kind !== "array") throw new Error("Expected references");
    const [a, b, c, t, fake] = result.items;
    expect(a?.kind).toBe("reference"); expect(b?.kind).toBe("reference"); expect(c?.kind).toBe("reference");
    expect(a?.kind === "reference" && b?.kind === "reference" && c?.kind === "reference" && a.symbol === b.symbol && b.symbol === c.symbol).toBe(true);
    expect(t).toMatchObject({ kind: "reference", symbol: token });
    expect(fake?.kind).toBe("object");
    expect(() => resolve("references")).toThrow(/arbitrary calls/);
  });

  it.each([
    ["ambient", /const bindings|ambient/], ["mutable", /const bindings/], ["cycle", /cyclic constant/],
    ["arbitrary", /arbitrary calls/], ["network", /arbitrary calls/], ["environment", /unresolved|ambient/],
    ["getter", /getters/], ["missing", /missing own property/], ["prototype", /missing own property/],
    ["hole", /sparse arrays/], ["mixed", /coercion/], ["infinity", /finite/], ["nan", /finite/],
    ["negativeInfinity", /finite/], ["unsupportedUnary", /unary/], ["unsupportedBinary", /binary operator/],
    ["badKey", /computed keys/], ["badArraySpread", /known array/], ["badObjectSpread", /known object/], ["newValue", /NewExpression/],
  ])("rejects %s with a location and reference path", (name, message) => {
    expect(() => resolve(name as string)).toThrow(message as RegExp);
    expect(() => resolve(name as string)).toThrowError(expect.objectContaining({ code: "DECORATOR_ARGUMENT_INVALID",
      location: expect.objectContaining({ filePath: expect.any(String), line: expect.any(Number) }), message: expect.stringContaining("Resolution path:") }));
  });

  it.each([
    "const alias = value; alias.n = 2;", "const alias = value.list; alias.push(2);",
    "value.n++;", "delete value.n;", "Object.assign(value, { n: 2 });",
    "const alias = value; const second = alias; second.list[0] = 2;",
    "const { list } = value; list.push(2);", "let alias = value; alias = {};",
    "const copy = { ...value }; copy.list.push(2);", "const [alias] = [value]; alias.n = 2;",
    "let alias; alias = value; alias.n = 2;",
    "const holder = {}; holder.nested = value; holder.nested.n = 2;",
    "new Mutator(value);",
  ])("rejects mutations through consumed bindings and aliases: %s", (mutation) => {
    const fixture = setup(`const value = { n: 1, list: [1] }; ${mutation} const result = value;`);
    expect(() => fixture.resolver.resolve(fixture.expression())).toThrow(/detected write|mutating call|value escape/);
  });

  it("ignores unrelated writes and respects shadowed mutation targets", () => {
    const fixture = setup("const value = { n: 1 }; function f() { const value = { n: 2 }; value.n = 3; } const result = value;");
    expect(plain(fixture.resolver.resolve(fixture.expression()).value)).toEqual({ n: 1 });
  });

  it("allows ordinary runtime uses of consumed scalar constants and scalar properties", () => {
    const fixture = setup('const number = 1; const object = { n: 2 }; console.log(number, object.n); const alias = object.n; console.log(alias); const result = [number, object.n];');
    expect(plain(fixture.resolver.resolve(fixture.expression()).value)).toEqual([1, 2]);
  });

  it("finds mutations in project-local modules already in the Program", () => {
    const fixture = setup('import { value } from "./value.js"; import "./mutate.js"; const result = value;', {
      "value.ts": "export const value = { n: 1 };", "mutate.ts": 'import { value as alias } from "./value.js"; alias.n = 2;',
    });
    expect(() => fixture.resolver.resolve(fixture.expression())).toThrow(/detected write/);
  });

  it.each(['ns.value.n = 2;', 'ns["value"].n = 2;'])("detects writes through namespace members: %s", (mutation) => {
    const fixture = setup(`import * as ns from "./value.js"; ${mutation} const result = ns.value;`, { "value.ts": "export const value = { n: 1 };" });
    expect(() => fixture.resolver.resolve(fixture.expression())).toThrow(/detected write/);
  });

  it("never imports application modules or executes top-level effects", () => {
    const sentinel = path.join(mkdtempSync(path.join(os.tmpdir(), "bunwire-static-sentinel-")), "executed");
    temporary.push(path.dirname(sentinel));
    const previous = process.env.BUNWIRE_STATIC_SENTINEL;
    process.env.BUNWIRE_STATIC_SENTINEL = sentinel;
    try { expect(plain(resolve("imported").value)).toHaveProperty("queue", "billing"); expect(existsSync(sentinel)).toBe(false); }
    finally { if (previous === undefined) delete process.env.BUNWIRE_STATIC_SENTINEL; else process.env.BUNWIRE_STATIC_SENTINEL = previous; }
  });

  it("contains sources by canonical project root, not the managed discovery roots", () => {
    const fixture = setup('import { value } from "./outside.js"; const result = value;', { "outside.ts": "export const value = 3;" });
    expect(plain(fixture.resolver.resolve(fixture.expression()).value)).toBe(3);
    // A root containing only entry.ts excludes the imported sibling.
    const narrow = mkdtempSync(path.join(fixture.root, "nested-"));
    writeFileSync(path.join(narrow, "entry.ts"), 'import { value } from "../outside.js"; const result = value;');
    const narrowProgram = ts.createProgram([path.join(narrow, "entry.ts")], compilerOptions);
    expect(() => new StaticExpressionResolver({ program: narrowProgram, projectRoot: narrow }).resolve(expression(narrowProgram, "result"))).toThrow(/source escapes/);
  });

  it("rejects filesystem links escaping the project boundary", () => {
    const fixture = setup('import { value } from "./linked/value.js"; const result = value;');
    const outside = mkdtempSync(path.join(os.tmpdir(), "bunwire-static-outside-")); temporary.push(outside);
    writeFileSync(path.join(outside, "value.ts"), "export const value = 3;");
    symlinkSync(outside, path.join(fixture.root, "linked"), "junction");
    const linkedProgram = ts.createProgram([path.join(fixture.root, "entry.ts")], compilerOptions);
    expect(() => new StaticExpressionResolver({ program: linkedProgram, projectRoot: fixture.root }).resolve(expression(linkedProgram, "result"))).toThrow(/source escapes/);
  });

  it("preserves explicitly authorized public package identities outside the application root", () => {
    const fixture = setup("const result = 0;");
    const external = mkdtempSync(path.join(os.tmpdir(), "bunwire-static-public-")); temporary.push(external);
    writeFileSync(path.join(external, "symbols.d.ts"), "export declare class Shared {} export declare const TOKEN: unique symbol;");
    writeFileSync(path.join(external, "public.d.ts"), 'export { Shared, TOKEN } from "./symbols.js";');
    const specifier = path.join(external, "public.js").replaceAll("\\", "/");
    writeFileSync(path.join(fixture.root, "entry.ts"), `import { Shared as Alias, TOKEN } from ${JSON.stringify(specifier)}; const result = [Alias, TOKEN];`);
    const publicProgram = ts.createProgram([path.join(fixture.root, "entry.ts")], compilerOptions);
    const checker = publicProgram.getTypeChecker();
    const module = checker.getSymbolAtLocation(publicProgram.getSourceFile(path.join(external, "symbols.d.ts"))!)!;
    const authorized = new Set(checker.getExportsOfModule(module));
    const result = new StaticExpressionResolver({ program: publicProgram, projectRoot: fixture.root,
      isCanonicalReference: (symbol) => authorized.has(symbol) }).resolve(expression(publicProgram, "result"));
    expect(result.value.kind === "array" && result.value.items.every((item) => item.kind === "reference" && authorized.has(item.symbol))).toBe(true);
    expect(result.dependencies.map((file) => path.basename(file)).sort()).toEqual(["entry.ts", "public.d.ts", "symbols.d.ts"]);
    expect(() => new StaticExpressionResolver({ program: publicProgram, projectRoot: fixture.root }).resolve(expression(publicProgram, "result"))).toThrow(/source escapes/);
  });

  it("resolves default constant exports and local import/re-export chains", () => {
    const fixture = setup('import value from "./forward.js"; const result = value;', {
      "value.ts": 'const value = { n: 2 }; export default value;',
      "forward.ts": 'import value from "./value.js"; export { value as default };',
    });
    const result = fixture.resolver.resolve(fixture.expression());
    expect(plain(result.value)).toEqual({ n: 2 });
    expect(result.dependencies.map((file) => path.basename(file))).toEqual(["entry.ts", "forward.ts", "value.ts"]);
  });

  it("rejects type-only imports/exports and values inferred from declaration files", () => {
    for (const source of ['import type { value } from "./value.js"; const result = value;',
      'import { value } from "./barrel.js"; const result = value;']) {
      const fixture = setup(source, { "value.ts": "export const value = 2;", "barrel.ts": 'export type { value } from "./value.js";' });
      expect(() => fixture.resolver.resolve(fixture.expression())).toThrow(/type-only/);
    }
    const fixture = setup('import { value } from "./ambient.js"; const result = value;', { "ambient.d.ts": 'export declare const value: "not a runtime initializer";' });
    expect(() => fixture.resolver.resolve(fixture.expression())).toThrow(/const bindings|ambient/);
    const star = setup('import { value } from "./barrel.js"; const result = value;', {
      "value.ts": "export const value = 2;", "barrel.ts": 'export type * from "./value.js";',
    });
    expect(() => star.resolver.resolve(star.expression())).toThrow(/type-only/);
  });

  it("rejects dependency package initializers even when their sources are inside the root", () => {
    const fixture = setup("const result = 1;");
    const dependency = path.join(fixture.root, "node_modules");
    mkdirSync(dependency);
    writeFileSync(path.join(dependency, "value.ts"), "export const value = 2;");
    writeFileSync(path.join(fixture.root, "entry.ts"), 'import { value } from "./node_modules/value.js"; const result = value;');
    const packageProgram = ts.createProgram([path.join(fixture.root, "entry.ts")], { ...compilerOptions, preserveSymlinks: true });
    expect(() => new StaticExpressionResolver({ program: packageProgram, projectRoot: fixture.root }).resolve(expression(packageProgram, "result"))).toThrow(/dependency package/);
  });

  it("has no public resolver export, runtime evaluator, or Core dependency on tooling", () => {
    expect(readFileSync(path.join(repo, "packages/vite/src/index.ts"), "utf8")).not.toMatch(/static-expression|StaticExpressionResolver/);
    const core = JSON.parse(readFileSync(path.join(repo, "packages/core/package.json"), "utf8"));
    expect(core.dependencies ?? {}).not.toHaveProperty("typescript");
    expect(core.dependencies ?? {}).not.toHaveProperty("@bunwire/vite");
    expect(readFileSync(path.join(repo, "packages/vite/src/static-expression.ts"), "utf8")).not.toMatch(/\beval\s*\(|new Function\b|\bimport\s*\(/);
  });

  it("accepts depth 64 and deterministically rejects depth 65 including cached paths", () => {
    const fixture = setup(`const base = 1; const seed = base; const result = ${"(".repeat(63)}0${")".repeat(63)}; const over = ${"(".repeat(64)}0${")".repeat(64)}; const cached = ${"(".repeat(62)}base${")".repeat(62)}; const cachedOver = ${"(".repeat(63)}base${")".repeat(63)};`);
    expect(plain(fixture.resolver.resolve(fixture.expression()).value)).toBe(0);
    expect(() => fixture.resolver.resolve(fixture.expression("over"))).toThrow(/depth budget \(64\)/);
    fixture.resolver.resolve(fixture.expression("seed"));
    expect(plain(fixture.resolver.resolve(fixture.expression("cached")).value)).toBe(1);
    expect(() => fixture.resolver.resolve(fixture.expression("cachedOver"))).toThrow(/depth budget \(64\)/);
  });

  it("charges exactly 100000 evaluated nodes and rejects the next node", () => {
    const fixture = setup(`const result = [${Array(99_999).fill("0").join(",")}]; const extra = 0;`);
    const result = fixture.resolver.resolve(fixture.expression()).value;
    expect(result.kind === "array" && result.items.length).toBe(99_999);
    expect(() => fixture.resolver.resolve(fixture.expression("extra"))).toThrow(/evaluated node budget \(100000\)/);
  });

  it("cache hits charge repeated expansion work and retain use-site diagnostics", () => {
    const fixture = setup(`const list = [${Array(49_997).fill("0").join(",")}];\nconst result = list;\nconst again = list;\nconst third = list;`);
    fixture.resolver.resolve(fixture.expression());
    fixture.resolver.resolve(fixture.expression("again"));
    expect(() => fixture.resolver.resolve(fixture.expression("third"))).toThrow(/evaluated node budget/);
    expect(() => fixture.resolver.resolve(fixture.expression("third"))).toThrow(/entry\.ts:4:/);
    const result = new StaticExpressionResolver({ program, projectRoot: fixtures });
    expect(result.resolve(expression(program, "alias")).dependencies).toContain(canonicalCompilerPath(path.join(fixtures, "star.ts")));
    expect(result.resolve(expression(program, "alias")).dependencies).toContain(canonicalCompilerPath(path.join(fixtures, "barrel.ts")));
  });

  it("shares the exact declaration limit for later policy expansion", () => {
    const node = expression(program, "primitive"); const resolver = new StaticExpressionResolver({ program, projectRoot: fixtures });
    for (let n = 0; n < STATIC_LIMITS.declarations; n++) resolver.emitDeclaration(node);
    expect(() => resolver.emitDeclaration(node)).toThrow(/declaration budget \(10000\)/);
  });
});
