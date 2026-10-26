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
      const symbol = this.metadata.inspectPolicyReference(current, raw, this.stack.length + 1);
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

  annotate(value: StaticValue, node: ts.Node): StaticValue {
    const helperPath = this.path();
    if (!helperPath) return value;
    this.metadata.work(node, this.stack.length + 1);
    if (value.kind === "array") return Object.freeze({ ...value, helperPath,
      items: Object.freeze(value.items.map((item) => this.annotate(item, node))) });
    if (value.kind === "object") {
      const properties: Record<string, StaticValue> = Object.create(null);
      for (const [key, item] of Object.entries(value.properties)) properties[key] = this.annotate(item, node);
      return Object.freeze({ ...value, helperPath, properties: Object.freeze(properties) });
    }
    return Object.freeze({ ...value, helperPath });
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
    this.metadata.inspectPolicyNode(body, this.stack.length);
    const block = body.body as ts.Block;
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
      this.metadata.withBindings(bindings, this.stack.length, () => {
        for (const statement of block.statements) {
          this.metadata.inspectPolicyNode(statement, this.stack.length + 1);
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
          if (!ts.isExpressionStatement(statement)) this.fail("Policy helper body supports only const declarations and direct policy/helper calls.", statement);
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
      });
    } catch (cause) {
      if (cause instanceof BunwireCompilerError && !cause.message.includes("Policy helper path:")) {
        const chain = this.stack.map((frame) => `${frame.body.name?.getText() ?? "<callback>"} (${at(frame.body).filePath}:${at(frame.body).line}) called at ${at(frame.call).filePath}:${at(frame.call).line}`).join(" -> ");
        throw new BunwireCompilerError(cause.code, `${cause.message} Policy helper path: ${chain}.`, { ...(cause.location ? { location: cause.location } : {}), cause });
      }
      throw cause;
    } finally { if (registryPushed) this.registryFrames.pop(); this.stack.pop(); }
  }
}
