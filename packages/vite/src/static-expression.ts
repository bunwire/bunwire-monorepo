import { realpathSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { BunwireCompilerError, type BunwireSourceLocation } from "./diagnostics.js";
import { canonicalCompilerPath } from "./path-identity.js";

export const STATIC_LIMITS = Object.freeze({ depth: 64, nodes: 100_000, declarations: 10_000 });

/** Compiler data is tagged so a class/token can never be mistaken for serialized data. */
export type StaticValue = (
  | { readonly kind: "scalar"; readonly value: string | number | boolean | null | undefined }
  | { readonly kind: "array"; readonly items: readonly StaticValue[] }
  | { readonly kind: "object"; readonly properties: Readonly<Record<string, StaticValue>>; readonly keyOrigins: Readonly<Record<string, BunwireSourceLocation>> }
  | { readonly kind: "reference"; readonly symbol: ts.Symbol }
) & { readonly origin: BunwireSourceLocation; readonly helperPath?: string };

export interface StaticResolution {
  readonly value: StaticValue;
  readonly dependencies: readonly string[];
  readonly provenance: readonly BunwireSourceLocation[];
}

export interface StaticExpressionOptions {
  readonly program: ts.Program;
  readonly projectRoot: string;
  /** Existing canonical authorization may admit opaque public package classes/tokens.
   * This callback inspects compiler symbols only; it must not evaluate application code. */
  readonly isCanonicalReference?: (symbol: ts.Symbol) => boolean;
  readonly deferMutationChecks?: boolean;
  /** Exact authorized decorator sites, not arbitrary functions sharing a name or ID. */
  readonly isMetadataConsumer?: (call: ts.CallExpression | ts.NewExpression) => boolean;
}

interface Step { readonly node: ts.Node; readonly depth: number }
interface Frame {
  readonly depth: number;
  readonly steps: Step[];
  readonly files: Set<string>;
  readonly origins: Map<string, BunwireSourceLocation>;
}
interface Cached extends Frame { readonly value: StaticValue }

function location(node: ts.Node): BunwireSourceLocation {
  const file = node.getSourceFile();
  const start = file.getLineAndCharacterOfPosition(node.getStart(file));
  const end = file.getLineAndCharacterOfPosition(node.getEnd());
  return Object.freeze({ filePath: path.resolve(file.fileName), line: start.line + 1,
    column: start.character + 1, endLine: end.line + 1, endColumn: end.character + 1 });
}

function unwrapped(node: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node)
    || ts.isNonNullExpression(node)) node = node.expression;
  return node;
}

/** One session per compilation. Limits accumulate across every resolve/cache hit. */
export class StaticExpressionResolver {
  private readonly checker: ts.TypeChecker;
  private readonly root: string;
  private readonly cache = new Map<ts.Symbol, Cached>();
  private readonly active = new Set<ts.Symbol>();
  private readonly consumed = new Set<ts.Symbol>();
  private readonly consumedProperties = new Map<ts.Symbol, StaticValue>();
  private readonly frames: Frame[] = [];
  private readonly chain: ts.Node[] = [];
  private readonly paths = new Map<string, string>();
  private readonly bindingFrames: ReadonlyMap<ts.Symbol, StaticValue>[] = [];
  private bindingDepth = 0;
  private nodes = 0;
  private declarations = 0;

  constructor(private readonly options: StaticExpressionOptions) {
    this.checker = options.program.getTypeChecker();
    this.root = canonicalCompilerPath(realpathSync(options.projectRoot));
  }

  resolve(expression: ts.Expression): StaticResolution {
    const frame: Frame = { depth: 0, steps: [], files: new Set(), origins: new Map() };
    this.frames.push(frame);
    try {
      const value = this.evaluate(expression, this.bindingDepth + 1);
      if (ts.isPropertyDeclaration(expression.parent) && expression.parent.initializer === expression) {
        const symbol = this.symbol(expression.parent.name);
        if (symbol) { this.consumed.add(symbol); this.consumedProperties.set(symbol, value); }
      }
      if (!this.options.deferMutationChecks) this.validateMutations();
      return Object.freeze({ value, dependencies: Object.freeze([...frame.files].sort()),
        provenance: Object.freeze([...frame.origins.values()]) });
    } finally { this.frames.pop(); }
  }

  /** Bind a reached policy helper's parameters/locals for one lexical expansion. */
  withBindings<T>(bindings: ReadonlyMap<ts.Symbol, StaticValue>, depth: number, run: () => T): T {
    const previous = this.bindingDepth;
    this.bindingDepth = depth;
    this.bindingFrames.push(bindings);
    try { return run(); }
    finally { this.bindingFrames.pop(); this.bindingDepth = previous; }
  }

  /** Follow real import/re-export syntax when a policy helper is reached. */
  inspectPolicyReference(expression: ts.Expression, raw: ts.Symbol, depth: number): { readonly symbol: ts.Symbol; readonly dependencies: readonly string[] } {
    const frame: Frame = { depth, steps: [], files: new Set(), origins: new Map() };
    this.frames.push(frame);
    try {
      const target = this.canonical(raw);
      this.charge(expression, depth);
      this.traceAliases(raw, target, depth + 1, false);
      const base = ts.isPropertyAccessExpression(expression) ? unwrapped(expression.expression) : undefined;
      const namespace = base && this.checker.getSymbolAtLocation(base)?.declarations?.find(ts.isNamespaceImport);
      if (namespace) {
        if (namespace.parent.isTypeOnly) this.fail(namespace, "type-only namespaces have no runtime value");
        const module = namespace.parent.parent.moduleSpecifier;
        if (ts.isStringLiteralLike(module) && ts.isPropertyAccessExpression(expression))
          this.exportPath(module, expression.name.text, target, depth + 1);
      }
      const declaration = target.valueDeclaration;
      if (!declaration) this.fail(expression, "policy helper has no runtime source declaration");
      this.file(declaration.getSourceFile());
      return { symbol: target, dependencies: [...frame.files] };
    } finally { this.frames.pop(); }
  }

  inspectPolicyNode(node: ts.Node, depth: number): string {
    this.charge(node, depth);
    this.file(node.getSourceFile());
    return this.paths.get(node.getSourceFile().fileName)!;
  }

  /** Shared accounting hook for policy expansion in subsequent milestones. */
  emitDeclaration(node: ts.Node): void {
    if (++this.declarations > STATIC_LIMITS.declarations) this.fail(node, "emitted policy declaration budget (10000) exceeded");
  }

  /** Policy normalization shares the expression budget, including cached group copies. */
  consumePolicyWork(node: ts.Node, depth: number, count = 1): void {
    for (let index = 0; index < count; index++) this.charge(node, depth);
  }

  private fail(node: ts.Node, reason: string): never {
    const chain = [...this.chain, node].map((entry) => {
      const at = location(entry);
      return `${entry.getText().slice(0, 100)} (${at.filePath}:${at.line}:${at.column})`;
    }).join(" -> ");
    throw new BunwireCompilerError("DECORATOR_ARGUMENT_INVALID",
      `Unsupported static expression: ${reason}. Resolution path: ${chain}`, { location: location(node) });
  }

  private charge(node: ts.Node, depth: number): void {
    if (depth > STATIC_LIMITS.depth) this.fail(node, "recursive resolution depth budget (64) exceeded");
    if (++this.nodes > STATIC_LIMITS.nodes) this.fail(node, "evaluated node budget (100000) exceeded");
    for (const frame of this.frames) frame.steps.push({ node, depth: depth - frame.depth });
    this.origin(node);
  }

  private origin(node: ts.Node): void {
    const at = location(node);
    for (const frame of this.frames) frame.origins.set(`${at.filePath}:${at.line}:${at.column}`, at);
  }

  private file(source: ts.SourceFile, opaque = false): void {
    let canonical = this.paths.get(source.fileName);
    if (!canonical) {
      try { canonical = canonicalCompilerPath(realpathSync(source.fileName)); }
      catch { this.fail(source, "source file is unavailable on disk"); }
      this.paths.set(source.fileName, canonical);
    }
    const relative = path.relative(this.root, canonical);
    if (!opaque && (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
      || relative.split(path.sep).includes("node_modules")
      || path.resolve(source.fileName).split(path.sep).includes("node_modules")
      || this.options.program.isSourceFileFromExternalLibrary(source))) this.fail(source, "source escapes the configured project root or belongs to a dependency package");
    for (const frame of this.frames) frame.files.add(canonical);
  }

  private canonical(symbol: ts.Symbol): ts.Symbol {
    const seen = new Set<ts.Symbol>();
    while (symbol.flags & ts.SymbolFlags.Alias) {
      if (seen.has(symbol)) break;
      seen.add(symbol);
      symbol = this.checker.getAliasedSymbol(symbol);
    }
    return symbol;
  }

  private symbol(node: ts.Node): ts.Symbol | undefined {
    // TypeScript does not return a symbol for the ElementAccessExpression itself.
    // Use the known syntax key to find its actual property symbol, never a type as a value.
    const found = ts.isElementAccessExpression(node)
      && (ts.isStringLiteralLike(node.argumentExpression) || ts.isNumericLiteral(node.argumentExpression))
      ? this.checker.getPropertyOfType(this.checker.getTypeAtLocation(node.expression), node.argumentExpression.text)
      : this.checker.getSymbolAtLocation(node);
    return found ? this.canonical(found) : undefined;
  }

  /** Walk actual export syntax too: getAliasedSymbol alone skips export-star barrels. */
  private exportPath(module: ts.StringLiteralLike, name: string, target: ts.Symbol,
    depth: number, seen = new Set<ts.SourceFile>(), opaque = false): boolean {
    this.charge(module, depth);
    const moduleSymbol = this.checker.getSymbolAtLocation(module);
    const source = moduleSymbol?.declarations?.find(ts.isSourceFile);
    if (!moduleSymbol || !source) this.fail(module, "module source is unavailable");
    if (seen.has(source)) return false;
    seen.add(source);
    this.file(source, opaque);
    const exported = this.checker.getExportsOfModule(moduleSymbol).find((entry) => entry.name === name);
    if (!exported || this.canonical(exported) !== target) return false;
    for (const statement of source.statements) {
      if (!ts.isExportDeclaration(statement)) continue;
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        const item = statement.exportClause.elements.find((entry) => entry.name.text === name);
        if (item) {
          this.origin(item);
          if (statement.isTypeOnly || item.isTypeOnly) this.fail(item, "type-only exports have no runtime value");
          if (statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier))
            return this.exportPath(statement.moduleSpecifier, (item.propertyName ?? item.name).text, target, depth + 1, seen, opaque);
          this.traceAliases(this.checker.getExportSpecifierLocalTargetSymbol(item), target, depth + 1, opaque);
          return true;
        }
      } else if (!statement.exportClause && statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)) {
        const nextModule = this.checker.getSymbolAtLocation(statement.moduleSpecifier);
        const candidate = nextModule && this.checker.getExportsOfModule(nextModule).find((entry) => entry.name === name);
        if (candidate && this.canonical(candidate) === target) {
          if (statement.isTypeOnly) this.fail(statement, "type-only exports have no runtime value");
          if (this.exportPath(statement.moduleSpecifier, name, target, depth + 1, seen, opaque)) return true;
        }
      }
    }
    return true;
  }

  private traceAliases(symbol: ts.Symbol | undefined, target: ts.Symbol, depth: number, opaque: boolean): void {
    if (!symbol) return;
    for (const declaration of symbol.declarations ?? []) {
      this.charge(declaration, depth);
      this.file(declaration.getSourceFile(), opaque);
      if (ts.isImportSpecifier(declaration)) {
        const clause = declaration.parent.parent;
        if (declaration.isTypeOnly || clause.isTypeOnly) this.fail(declaration, "type-only imports have no runtime value");
        const module = clause.parent.moduleSpecifier;
        if (ts.isStringLiteralLike(module)) this.exportPath(module, (declaration.propertyName ?? declaration.name).text, target, depth + 1, new Set(), opaque);
      } else if (ts.isImportClause(declaration)) {
        if (declaration.isTypeOnly) this.fail(declaration, "type-only imports have no runtime value");
        const module = declaration.parent.moduleSpecifier;
        if (ts.isStringLiteralLike(module)) this.exportPath(module, "default", target, depth + 1, new Set(), opaque);
      }
    }
  }

  private reference(node: ts.Expression, raw: ts.Symbol, depth: number): StaticValue {
    this.chain.push(node);
    try { return this.resolveReference(node, raw, depth); }
    finally { this.chain.pop(); }
  }

  private resolveReference(node: ts.Expression, raw: ts.Symbol, depth: number): StaticValue {
    const symbol = this.canonical(raw);
    for (let index = this.bindingFrames.length - 1; index >= 0; index--) {
      const value = this.bindingFrames[index]!.get(symbol);
      if (value) { this.consumed.add(symbol); return value; }
    }
    const authorized = this.options.isCanonicalReference?.(symbol) === true;
    this.traceAliases(raw, symbol, depth, authorized);
    const declaration = symbol.valueDeclaration;
    if (!declaration) this.fail(node, "ambient or type-only declarations do not supply runtime initializers");
    this.file(declaration.getSourceFile(), authorized);
    if (authorized || (ts.isClassDeclaration(declaration) && !declaration.getSourceFile().isDeclarationFile
      && !declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword))) {
      this.origin(declaration);
      return Object.freeze({ kind: "reference", symbol, origin: location(node) });
    }
    if (ts.isExportAssignment(declaration) && !declaration.isExportEquals) {
      if (this.active.has(symbol)) this.fail(node, `cyclic constant reference to ${symbol.name}`);
      this.active.add(symbol);
      try { return this.evaluate(declaration.expression, depth + 1); }
      finally { this.active.delete(symbol); }
    }
    if (declaration.getSourceFile().isDeclarationFile || !ts.isVariableDeclaration(declaration)
      || !ts.isVariableDeclarationList(declaration.parent) || !(declaration.parent.flags & ts.NodeFlags.Const)
      || !ts.isIdentifier(declaration.name) || !declaration.initializer
      || !ts.isVariableStatement(declaration.parent.parent)
      || declaration.parent.parent.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword))
      this.fail(declaration, "only const bindings with supported source initializers can supply static values");
    this.consumed.add(symbol);
    if (this.active.has(symbol)) this.fail(node, `cyclic constant reference to ${symbol.name}`);
    const cached = this.cache.get(symbol);
    if (cached) {
      for (const step of cached.steps) this.charge(step.node, depth + step.depth);
      for (const frame of this.frames) {
        for (const file of cached.files) frame.files.add(file);
        for (const [key, at] of cached.origins) frame.origins.set(key, at);
      }
      return cached.value;
    }
    const frame: Frame = { depth, steps: [], files: new Set(), origins: new Map() };
    this.frames.push(frame); this.active.add(symbol);
    try {
      this.origin(declaration);
      this.file(declaration.getSourceFile());
      const value = this.evaluate(declaration.initializer, depth + 1);
      this.cache.set(symbol, { ...frame, value });
      return value;
    } finally { this.active.delete(symbol); this.frames.pop(); }
  }

  private evaluate(node: ts.Expression, depth: number): StaticValue {
    this.charge(node, depth);
    this.file(node.getSourceFile());
    const origin = location(node);
    const scalar = (value: string | number | boolean | null | undefined): StaticValue => {
      if (typeof value === "number" && !Number.isFinite(value)) this.fail(node, "numeric result must be finite");
      return Object.freeze({ kind: "scalar", value, origin });
    };
    const evaluate = (child: ts.Expression) => this.evaluate(child, depth + 1);
    if (unwrapped(node) !== node) return evaluate((node as ts.ParenthesizedExpression).expression);
    if (ts.isStringLiteralLike(node)) return scalar(node.text);
    if (ts.isNumericLiteral(node)) return scalar(Number(node.text.replaceAll("_", "")));
    if (node.kind === ts.SyntaxKind.TrueKeyword) return scalar(true);
    if (node.kind === ts.SyntaxKind.FalseKeyword) return scalar(false);
    if (node.kind === ts.SyntaxKind.NullKeyword) return scalar(null);
    if (ts.isIdentifier(node)) {
      const raw = this.checker.getSymbolAtLocation(node);
      if (node.text === "undefined" && (!raw || !raw.declarations?.length)) return scalar(undefined);
      if (!raw) this.fail(node, "unresolved identifier");
      return this.reference(node, raw, depth);
    }
    if (ts.isArrayLiteralExpression(node)) {
      const items: StaticValue[] = [];
      for (const item of node.elements) {
        if (ts.isOmittedExpression(item)) this.fail(item, "sparse arrays are unsupported");
        if (ts.isSpreadElement(item)) {
          this.charge(item, depth + 1);
          const spread = this.evaluate(item.expression, depth + 2);
          if (spread.kind !== "array") this.fail(item, "array spread requires a known array");
          for (const value of spread.items) items.push(value);
        } else items.push(evaluate(item));
      }
      return Object.freeze({ kind: "array", items: Object.freeze(items), origin });
    }
    if (ts.isObjectLiteralExpression(node)) {
      const properties: Record<string, StaticValue> = Object.create(null);
      const keyOrigins: Record<string, BunwireSourceLocation> = Object.create(null);
      for (const property of node.properties) {
        this.charge(property, depth + 1);
        if (ts.isSpreadAssignment(property)) {
          const spread = this.evaluate(property.expression, depth + 2);
          if (spread.kind !== "object") this.fail(property, "object spread requires a known object");
          for (const key of Object.keys(spread.properties)) {
            properties[key] = spread.properties[key]!;
            keyOrigins[key] = spread.keyOrigins[key]!;
          }
        } else if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
          const computed = ts.isComputedPropertyName(property.name) ? this.evaluate(property.name.expression, depth + 2) : undefined;
          const key = computed ? this.key(computed, property.name) : (property.name as ts.Identifier | ts.StringLiteral | ts.NumericLiteral).text;
          keyOrigins[key] = computed?.origin ?? location(property.name);
          if (ts.isShorthandPropertyAssignment(property)) {
            const symbol = this.checker.getShorthandAssignmentValueSymbol(property);
            if (!symbol) this.fail(property, "unresolved shorthand property");
            properties[key] = this.reference(property.name, symbol, depth + 2);
          } else properties[key] = this.evaluate(property.initializer, depth + 2);
        } else this.fail(property, "object methods, getters, and setters are unsupported");
      }
      return Object.freeze({ kind: "object", properties: Object.freeze(properties), keyOrigins: Object.freeze(keyOrigins), origin });
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      if (node.questionDotToken) this.fail(node, "optional property access is unsupported");
      // Namespace imports are symbol lookups, not reads from runtime objects.
      const base = unwrapped(node.expression);
      const rawBase = this.checker.getSymbolAtLocation(base);
      const namespace = rawBase?.declarations?.find(ts.isNamespaceImport);
      if (namespace) {
        if (namespace.parent.isTypeOnly) this.fail(namespace, "type-only namespaces have no runtime value");
        const name = ts.isPropertyAccessExpression(node) ? node.name.text : this.key(evaluate(node.argumentExpression), node);
        const module = namespace.parent.parent.moduleSpecifier;
        const moduleSymbol = this.checker.getSymbolAtLocation(module);
        const member = moduleSymbol && this.checker.getExportsOfModule(moduleSymbol).find((entry) => entry.name === name);
        if (!member || !ts.isStringLiteralLike(module)) this.fail(node, "missing namespace export");
        const target = this.canonical(member);
        this.exportPath(module, name, target, depth + 1, new Set(), this.options.isCanonicalReference?.(target) === true);
        return this.reference(node, member, depth + 1);
      }
      const value = evaluate(node.expression);
      const key = ts.isPropertyAccessExpression(node) ? node.name.text : this.key(evaluate(node.argumentExpression), node);
      if (value.kind === "object" && Object.hasOwn(value.properties, key)) return value.properties[key]!;
      if (value.kind === "array") {
        if (key === "length") return scalar(value.items.length);
        if (/^(0|[1-9]\d*)$/.test(key) && Number(key) < value.items.length) return value.items[Number(key)]!;
      }
      this.fail(node, `missing own property "${key}" or unsupported property receiver`);
    }
    if (ts.isPrefixUnaryExpression(node)) {
      const value = evaluate(node.operand);
      if (value.kind !== "scalar" || typeof value.value !== "number"
        || (node.operator !== ts.SyntaxKind.PlusToken && node.operator !== ts.SyntaxKind.MinusToken))
        this.fail(node, "unary + and - require finite numeric operands");
      return scalar(node.operator === ts.SyntaxKind.MinusToken ? -value.value : value.value);
    }
    if (ts.isBinaryExpression(node)) {
      const left = evaluate(node.left); const right = evaluate(node.right);
      if (left.kind !== "scalar" || right.kind !== "scalar") this.fail(node, "operators require scalar operands");
      const op = node.operatorToken.kind;
      if (op === ts.SyntaxKind.PlusToken && typeof left.value === "string" && typeof right.value === "string") return scalar(left.value + right.value);
      if (typeof left.value !== "number" || typeof right.value !== "number") this.fail(node, "implicit coercion is unsupported; use numbers or string + string");
      const a = left.value; const b = right.value;
      switch (op) {
        case ts.SyntaxKind.PlusToken: return scalar(a + b);
        case ts.SyntaxKind.MinusToken: return scalar(a - b);
        case ts.SyntaxKind.AsteriskToken: return scalar(a * b);
        case ts.SyntaxKind.SlashToken: return scalar(a / b);
        case ts.SyntaxKind.PercentToken: return scalar(a % b);
        case ts.SyntaxKind.AsteriskAsteriskToken: return scalar(a ** b);
        default: this.fail(node, `unsupported binary operator ${node.operatorToken.getText()}`);
      }
    }
    this.fail(node, ts.isCallExpression(node) ? "arbitrary calls are unsupported; application functions are never executed"
      : `unsupported operation ${ts.SyntaxKind[node.kind]}`);
  }

  private key(value: StaticValue, node: ts.Node): string {
    if (value.kind !== "scalar" || (typeof value.value !== "string" && typeof value.value !== "number"))
      this.fail(node, "computed keys must resolve to strings or numbers");
    return String(value.value);
  }

  validateMutations(): void {
    const aliases = new Set(this.consumed);
    const aliasValues = new Map([...this.cache].map(([symbol, cached]) => [symbol, cached.value]));
    for (const [symbol, value] of this.consumedProperties) aliasValues.set(symbol, value);
    const files = this.options.program.getSourceFiles().filter((source) => {
      if (source.isDeclarationFile) return false;
      let real: string;
      try { real = canonicalCompilerPath(realpathSync(source.fileName)); } catch { return false; }
      const relative = path.relative(this.root, real);
      return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
        && !relative.split(path.sep).includes("node_modules");
    });
    const derived = (expression: ts.Expression): boolean => {
      const node = unwrapped(expression);
      if (ts.isIdentifier(node)) { const symbol = this.symbol(node); return Boolean(symbol && aliases.has(symbol)); }
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const symbol = this.symbol(ts.isPropertyAccessExpression(node) ? node.name : node);
        // An unresolved computed key must not bypass mutation checks on a known
        // receiver. Inspect candidate property identities, not inferred key values.
        if (!symbol && ts.isElementAccessExpression(node)
          && this.checker.getTypeAtLocation(node.expression).getProperties()
            .some((property) => aliases.has(this.canonical(property)))) return true;
        return Boolean(symbol && aliases.has(symbol)) || derived(node.expression);
      }
      if (ts.isArrayLiteralExpression(node)) return node.elements.some((item) => !ts.isOmittedExpression(item) && derived(item));
      if (ts.isSpreadElement(node)) return derived(node.expression);
      if (ts.isObjectLiteralExpression(node)) return node.properties.some((property) => {
        if (ts.isSpreadAssignment(property)) return derived(property.expression);
        if (ts.isPropertyAssignment(property)) return derived(property.initializer);
        if (ts.isShorthandPropertyAssignment(property)) {
          const symbol = this.checker.getShorthandAssignmentValueSymbol(property);
          return Boolean(symbol && aliases.has(this.canonical(symbol)));
        }
        return false;
      });
      return false;
    };
    const knownValue = (expression: ts.Expression): StaticValue | undefined => {
      const node = unwrapped(expression);
      if (ts.isIdentifier(node)) { const symbol = this.symbol(node); return symbol ? aliasValues.get(symbol) : undefined; }
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const member = this.symbol(ts.isPropertyAccessExpression(node) ? node.name : node);
        if (member && aliasValues.has(member)) return aliasValues.get(member);
        const value = knownValue(node.expression);
        const key = ts.isPropertyAccessExpression(node) ? node.name.text
          : ts.isStringLiteralLike(node.argumentExpression) || ts.isNumericLiteral(node.argumentExpression) ? node.argumentExpression.text : undefined;
        if (key !== undefined && value?.kind === "object" && Object.hasOwn(value.properties, key)) return value.properties[key];
        if (key !== undefined && value?.kind === "array" && /^(0|[1-9]\d*)$/.test(key)) return value.items[Number(key)];
      }
      return undefined;
    };
    // A fixed point follows aliases declared before/after each other and nested property aliases.
    const variables: ts.VariableDeclaration[] = [];
    const writes: ts.Node[] = [];
    const assignments: ts.BinaryExpression[] = [];
    const calls: (ts.CallExpression | ts.NewExpression)[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node)) variables.push(node);
      if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) { writes.push(node.left); assignments.push(node); }
      if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
        && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) writes.push(node.operand);
      if (ts.isDeleteExpression(node)) writes.push(node.expression);
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) calls.push(node);
      ts.forEachChild(node, visit);
    };
    for (const source of files) visit(source);
    let changed = true;
    while (changed) {
      changed = false;
      for (const declaration of variables) {
        if (!declaration.initializer || !derived(declaration.initializer)) continue;
        const names: ts.Identifier[] = [];
        const collect = (name: ts.BindingName): void => {
          if (ts.isIdentifier(name)) names.push(name);
          else for (const item of name.elements) if (ts.isBindingElement(item)) collect(item.name);
        };
        collect(declaration.name);
        for (const name of names) {
          const symbol = this.symbol(name);
          if (symbol && !aliases.has(symbol)) {
            aliases.add(symbol);
            const value = ts.isIdentifier(declaration.name) ? knownValue(declaration.initializer) : undefined;
            if (value) aliasValues.set(symbol, value);
            changed = true;
          }
        }
      }
      for (const assignment of assignments) {
        if (!derived(assignment.right) || !ts.isIdentifier(assignment.left)) continue;
        const symbol = this.symbol(assignment.left);
        if (symbol && !aliases.has(symbol)) {
          aliases.add(symbol);
          const value = knownValue(assignment.right);
          if (value) aliasValues.set(symbol, value);
          changed = true;
        }
      }
    }
    const canMutate = (value: ts.Expression): boolean => derived(value) && knownValue(value)?.kind !== "scalar";
    for (const assignment of assignments) if (!ts.isIdentifier(assignment.left) && canMutate(assignment.right))
      this.fail(assignment, "value escape through property/destructuring assignment affecting a consumed static value");
    for (const write of writes) if (derived(write as ts.Expression)) this.fail(write, "detected write affecting a consumed static value through a binding, alias, or property");
    for (const call of calls) {
      if (this.options.isMetadataConsumer?.(call)) continue;
      const target = unwrapped(call.expression);
      if (((ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) && canMutate(target.expression))
        || call.arguments?.some(canMutate))
        this.fail(call, "mutating call or value escape affecting a consumed static value; mutation cannot reconfigure generated metadata");
    }
  }
}
