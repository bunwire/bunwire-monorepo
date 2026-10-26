import path from "node:path";
import ts from "typescript";
import { BunwireCompilerError, type BunwireSourceLocation } from "./diagnostics.js";
import { type ManagedMetadataResolver } from "./managed-metadata.js";
import type { StaticValue } from "./static-expression.js";
import { unwrapBootstrapExpression } from "./bootstrap-discovery.js";

type PolicyCode = "MIDDLEWARE_POLICY_INVALID" | "SCHEDULE_POLICY_INVALID";
type PolicyFunction = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;
type PolicyArgument = StaticValue | { readonly kind: "registry" };
const REGISTRY = Object.freeze({ kind: "registry" as const });

function at(node: ts.Node): BunwireSourceLocation {
  const source = node.getSourceFile();
  const start = source.getLineAndCharacterOfPosition(node.getStart(source));
  const end = source.getLineAndCharacterOfPosition(node.getEnd());
  return Object.freeze({ filePath: path.resolve(source.fileName), line: start.line + 1,
    column: start.character + 1, endLine: end.line + 1, endColumn: end.character + 1 });
}

/** A syntax-only expansion of reached policy helpers; application functions are never invoked. */
export class StaticPolicyHelpers {
  private readonly checker: ts.TypeChecker;
  private readonly registryFrames: ReadonlySet<ts.Symbol>[] = [];
  private readonly stack: { readonly body: PolicyFunction; readonly call: ts.Node }[] = [];
  private readonly loopFrames: { readonly node: ts.ForOfStatement; readonly index: number }[] = [];
  private readonly semantic = new Map<ts.SourceFile, readonly ts.Diagnostic[]>();
  private namedCallback = false;

  constructor(
    private readonly program: ts.Program,
    private readonly metadata: ManagedMetadataResolver,
    private readonly code: PolicyCode,
  ) { this.checker = program.getTypeChecker(); }

  private fail(message: string, node: ts.Node): never {
    throw new BunwireCompilerError(this.code, message, { location: at(node) });
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
    const raw = this.checker.getSymbolAtLocation(node);
    return raw && this.canonical(raw);
  }

  private depth(): number { return this.stack.length + this.loopFrames.length; }

  isRegistry(expression: ts.Expression): boolean {
    const node = unwrapBootstrapExpression(expression);
    const symbol = ts.isIdentifier(node) ? this.symbol(node) : undefined;
    return Boolean(symbol && this.registryFrames.some((frame) => frame.has(symbol)));
  }

  private containsRegistry(node: ts.Node): boolean {
    if (ts.isIdentifier(node) && this.isRegistry(node)) return true;
    let found = false;
    ts.forEachChild(node, (child) => { if (this.containsRegistry(child)) found = true; });
    return found;
  }

  private checkTypes(call: ts.CallExpression): void {
    let diagnostics = this.semantic.get(call.getSourceFile());
    if (!diagnostics) {
      diagnostics = this.program.getSemanticDiagnostics(call.getSourceFile());
      this.semantic.set(call.getSourceFile(), diagnostics);
    }
    const diagnostic = diagnostics.find((entry) => entry.start !== undefined
      && entry.start >= call.getStart() && entry.start < call.getEnd());
    if (diagnostic) this.fail(`Policy helper call is not type-correct: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`, call);
  }

  private helper(expression: ts.Expression): PolicyFunction {
    let current = unwrapBootstrapExpression(expression);
    const seen = new Set<ts.Symbol>();
    while (ts.isIdentifier(current) || ts.isPropertyAccessExpression(current)) {
      const raw = this.checker.getSymbolAtLocation(ts.isPropertyAccessExpression(current) ? current.name : current);
      if (!raw) this.fail("Unknown policy helper target.", current);
      const symbol = this.metadata.inspectPolicyReference(current, raw, this.depth() + 1);
      if (seen.has(symbol)) this.fail("Cyclic policy helper alias.", current);
      seen.add(symbol);
      const declaration = symbol.valueDeclaration;
      if (declaration && ts.isFunctionDeclaration(declaration)) return declaration;
      if (!declaration || !ts.isVariableDeclaration(declaration) || !ts.isIdentifier(declaration.name)
        || !ts.isVariableDeclarationList(declaration.parent) || !(declaration.parent.flags & ts.NodeFlags.Const)
        || !declaration.initializer) this.fail("Policy helper must be a source function declaration or const function expression.", current);
      current = unwrapBootstrapExpression(declaration.initializer);
      if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) return current;
    }
    return this.fail("Policy helper target must be a direct function symbol or const alias.", current);
  }

  private arguments(call: ts.CallExpression): readonly PolicyArgument[] {
    const values: PolicyArgument[] = [];
    for (const argument of call.arguments) {
      if (ts.isSpreadElement(argument)) {
        if (this.containsRegistry(argument.expression)) this.fail("Registry capability cannot be spread or stored.", argument);
        const spread = this.metadata.resolve(argument.expression, this.code);
        if (spread.kind !== "array") this.fail("Policy helper argument spread requires a known array.", argument);
        values.push(...spread.items);
      } else if (this.isRegistry(argument)) values.push(REGISTRY);
      else {
        if (this.containsRegistry(argument)) this.fail("Registry capability may only be passed directly to a supported helper.", argument);
        values.push(this.metadata.resolve(argument, this.code));
      }
    }
    return values;
  }

  expand(callback: ts.Expression, site: ts.Node, visitPolicy: (statement: ts.ExpressionStatement) => void): void {
    const direct = unwrapBootstrapExpression(callback);
    this.namedCallback = !(ts.isArrowFunction(direct) || ts.isFunctionExpression(direct));
    const helper = ts.isArrowFunction(direct) || ts.isFunctionExpression(direct) ? direct : this.helper(direct);
    this.run(helper, [REGISTRY], site, visitPolicy);
    if (!(ts.isArrowFunction(direct) || ts.isFunctionExpression(direct)) && ts.isCallExpression(site)) this.checkTypes(site);
  }

  path(): string | undefined {
    if (this.stack.length === 1 && !this.namedCallback) return undefined;
    return this.stack.map((frame) => `${frame.body.name?.getText() ?? "<callback>"} (${at(frame.body).filePath}:${at(frame.body).line}) called at ${at(frame.call).filePath}:${at(frame.call).line}`).join(" -> ");
  }

  private loopPath(): string | undefined {
    return this.loopFrames.length
      ? this.loopFrames.map((frame) => `${at(frame.node).filePath}:${at(frame.node).line} [iteration ${frame.index}]`).join(" -> ")
      : undefined;
  }

  annotate(value: StaticValue, node: ts.Node): StaticValue {
    const helperPath = this.path();
    const loopPath = this.loopPath();
    if (!helperPath && !loopPath) return value;
    if (helperPath) this.metadata.work(node, this.depth() + 1);
    const paths = { ...(helperPath ? { helperPath } : {}), ...(loopPath ? { loopPath } : {}) };
    if (value.kind === "array") return Object.freeze({ ...value, ...paths,
      items: Object.freeze(value.items.map((item) => this.annotate(item, node))) });
    if (value.kind === "object") {
      const properties: Record<string, StaticValue> = Object.create(null);
      for (const [key, item] of Object.entries(value.properties)) properties[key] = this.annotate(item, node);
      return Object.freeze({ ...value, ...paths, properties: Object.freeze(properties) });
    }
    return Object.freeze({ ...value, ...paths });
  }

  private run(body: PolicyFunction, args: readonly PolicyArgument[], site: ts.Node,
    visitPolicy: (statement: ts.ExpressionStatement) => void): void {
    if (this.stack.some((frame) => frame.body === body))
      this.fail(`Recursive policy helper call to ${at(body).filePath}:${at(body).line} from ${at(site).filePath}:${at(site).line}.`, site);
    this.stack.push({ body, call: site });
    let registryPushed = false;
    try {
      if (body.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) || body.asteriskToken
        || !body.body || !ts.isBlock(body.body) || body.parameters.some((parameter) => !ts.isIdentifier(parameter.name)
          || parameter.dotDotDotToken || parameter.initializer || parameter.questionToken))
        this.fail("Policy helpers require synchronous block bodies and plain identifier parameters.", body);
      if (body.parameters.length !== args.length) this.fail(`Policy helper requires ${body.parameters.length} arguments; received ${args.length}.`, site);
      this.metadata.inspectPolicyNode(body, this.depth());
      const bindings = new Map<ts.Symbol, StaticValue>();
      const registries = new Set<ts.Symbol>();
      for (const [index, parameter] of body.parameters.entries()) {
        const symbol = this.symbol(parameter.name);
        if (!symbol) this.fail("Policy helper parameter has no TypeScript symbol.", parameter);
        const value = args[index]!;
        if (value.kind === "registry") registries.add(symbol);
        else bindings.set(symbol, value);
      }
      this.registryFrames.push(registries);
      registryPushed = true;
      const block = body.body as ts.Block;
      this.metadata.withBindings(bindings, this.depth(), () => this.expandStatements(block.statements, bindings, visitPolicy));
    } catch (cause) {
      if (cause instanceof BunwireCompilerError && !cause.message.includes("Policy helper path:")) {
        const chain = this.stack.map((frame) => `${frame.body.name?.getText() ?? "<callback>"} (${at(frame.body).filePath}:${at(frame.body).line}) called at ${at(frame.call).filePath}:${at(frame.call).line}`).join(" -> ");
        throw new BunwireCompilerError(cause.code, `${cause.message} Policy helper path: ${chain}.`, { ...(cause.location ? { location: cause.location } : {}), cause });
      }
      throw cause;
    } finally { if (registryPushed) this.registryFrames.pop(); this.stack.pop(); }
  }

  private expandStatements(statements: ts.NodeArray<ts.Statement>, bindings: Map<ts.Symbol, StaticValue>,
    visitPolicy: (statement: ts.ExpressionStatement) => void): void {
    for (const statement of statements) {
      this.metadata.inspectPolicyNode(statement, this.depth() + 1);
      if (ts.isFunctionDeclaration(statement)) continue;
      if (ts.isVariableStatement(statement)) {
        if (!(statement.declarationList.flags & ts.NodeFlags.Const)) this.fail("Policy helper locals must be const declarations.", statement);
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name) || !declaration.initializer) this.fail("Policy helper locals need identifier names and initializers.", declaration);
          if (this.containsRegistry(declaration.initializer)) this.fail("Registry capability cannot be stored in a local value.", declaration);
          const symbol = this.symbol(declaration.name);
          if (!symbol) this.fail("Policy helper local has no TypeScript symbol.", declaration);
          const initializer = unwrapBootstrapExpression(declaration.initializer);
          if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)
            || this.checker.getTypeAtLocation(initializer).getCallSignatures().length) continue;
          bindings.set(symbol, this.metadata.resolve(declaration.initializer, this.code));
        }
        continue;
      }
      if (ts.isForOfStatement(statement)) {
        this.expandLoop(statement, visitPolicy);
        continue;
      }
      if (ts.isForStatement(statement) || ts.isForInStatement(statement)
        || ts.isWhileStatement(statement) || ts.isDoStatement(statement))
        this.fail("Only bounded for (const item of knownArray) loops are supported in policy bodies.", statement);
      if (ts.isIfStatement(statement) || ts.isSwitchStatement(statement))
        this.fail("Policy helper body supports only const declarations and direct policy/helper calls, plus bounded for...of loops. Conditional control flow is unsupported in policy bodies.", statement);
      if (ts.isBreakStatement(statement) || ts.isContinueStatement(statement))
        this.fail("break and continue are unsupported in static policy loops.", statement);
      if (!ts.isExpressionStatement(statement)) this.fail("Policy helper body supports only const declarations and direct policy/helper calls, plus bounded for...of loops.", statement);
      const expression = unwrapBootstrapExpression(statement.expression);
      if (!ts.isCallExpression(expression) || expression.questionDotToken) this.fail("Policy helper statements must be direct non-optional calls.", statement);
      const callee = unwrapBootstrapExpression(expression.expression);
      if (ts.isIdentifier(callee) || (ts.isPropertyAccessExpression(callee)
        && (ts.isIdentifier(callee.expression) || ts.isPropertyAccessExpression(callee.expression))
        && !this.isRegistry(callee.expression))) {
        const target = this.helper(callee);
        const values = this.arguments(expression);
        if (values.length !== target.parameters.length) this.fail(`Policy helper requires ${target.parameters.length} arguments; received ${values.length}.`, expression);
        this.checkTypes(expression);
        this.metadata.allowDecorator(expression);
        this.run(target, values, expression, visitPolicy);
      } else visitPolicy(statement);
    }
  }

  private expandLoop(loop: ts.ForOfStatement, visitPolicy: (statement: ts.ExpressionStatement) => void): void {
    const initializer = loop.initializer;
    if (loop.awaitModifier || !ts.isVariableDeclarationList(initializer)
      || !(initializer.flags & ts.NodeFlags.Const) || initializer.declarations.length !== 1
      || !ts.isIdentifier(initializer.declarations[0]!.name)
      || initializer.declarations[0]!.initializer || !ts.isBlock(loop.statement))
      this.fail("Static policy loops require synchronous for (const item of knownArray) with one identifier and a block body.", loop);
    if (this.containsRegistry(loop.expression)) this.fail("Registry capability cannot be used as a loop iterable.", loop.expression);
    const values = this.metadata.resolve(loop.expression, this.code);
    if (values.kind !== "array") this.fail("Static policy for...of iterable must resolve to a known array.", loop.expression);
    const symbol = this.symbol(initializer.declarations[0]!.name);
    if (!symbol) this.fail("Static policy loop binding has no TypeScript symbol.", initializer);
    const block = loop.statement as ts.Block;
    for (const [index, value] of values.items.entries()) {
      this.loopFrames.push({ node: loop, index });
      try {
        this.metadata.work(loop, this.depth());
        const bindings = new Map<ts.Symbol, StaticValue>([[symbol, value]]);
        this.metadata.withBindings(bindings, this.depth(), () => this.expandStatements(block.statements, bindings, visitPolicy));
      } catch (cause) {
        if (cause instanceof BunwireCompilerError && !cause.message.includes("Policy loop path:")) {
          const path = this.loopFrames.map((frame) => `${at(frame.node).filePath}:${at(frame.node).line} [iteration ${frame.index}]`).join(" -> ");
          throw new BunwireCompilerError(cause.code, `${cause.message} Policy loop path: ${path}.`,
            { ...(cause.location ? { location: cause.location } : {}), cause });
        }
        throw cause;
      } finally { this.loopFrames.pop(); }
    }
  }
}
