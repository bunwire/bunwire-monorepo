import ts from "typescript";
import { BunwireCompilerError, type BunwireSourceLocation } from "./diagnostics.js";
import { StaticExpressionResolver, type StaticValue } from "./static-expression.js";

/** Analysis-local bridge: feature validators receive data, never compiler reference leaves. */
export class ManagedMetadataResolver {
  private readonly consumers = new Set<ts.CallExpression>();
  private readonly references = new Set<ts.Symbol>();
  private readonly policyMethods = new Set<ts.Symbol>();
  private readonly resolver: StaticExpressionResolver;
  readonly dependencies = new Set<string>();
  readonly provenance: BunwireSourceLocation[] = [];

  constructor(private readonly program: ts.Program, projectRoot: string) {
    const checker = program.getTypeChecker();
    const contracts = ["MiddlewarePolicyRegistry", "ApplicationScheduleRegistry", "ScheduleCadenceBuilder", "ConfiguredScheduleBuilder"];
    for (const source of program.getSourceFiles()) for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier)
        || statement.moduleSpecifier.text !== "@bunwire/core") continue;
      const module = checker.getSymbolAtLocation(statement.moduleSpecifier);
      if (!module) continue;
      for (const name of contracts) {
        const exported = checker.getExportsOfModule(module).find((symbol) => symbol.name === name);
        if (!exported) continue;
        const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
        for (const member of checker.getDeclaredTypeOfSymbol(symbol).getProperties()) this.policyMethods.add(member);
      }
    }
    this.resolver = new StaticExpressionResolver({ program, projectRoot, deferMutationChecks: true,
      isCanonicalReference: (symbol) => this.references.has(symbol),
      isMetadataConsumer: (call) => ts.isCallExpression(call) && (this.consumers.has(call)
        || (ts.isPropertyAccessExpression(call.expression)
          && this.policyMethods.has(checker.getSymbolAtLocation(call.expression.name)!))) });
  }

  allowDecorator(call: ts.CallExpression | undefined): void {
    if (call) this.consumers.add(call);
  }

  allowReference(symbol: ts.Symbol): void { this.references.add(symbol); }

  withBindings<T>(bindings: ReadonlyMap<ts.Symbol, StaticValue>, depth: number, run: () => T): T {
    return this.resolver.withBindings(bindings, depth, run);
  }

  inspectPolicyReference(expression: ts.Expression, symbol: ts.Symbol, depth: number): ts.Symbol {
    const result = this.resolver.inspectPolicyReference(expression, symbol, depth);
    for (const file of result.dependencies) this.dependencies.add(file);
    return result.symbol;
  }

  inspectPolicyNode(node: ts.Node, depth: number): void { this.dependencies.add(this.resolver.inspectPolicyNode(node, depth)); }

  sourceText(origin: BunwireSourceLocation): string {
    const file = this.program.getSourceFile(origin.filePath);
    return file?.text.slice(file.getPositionOfLineAndCharacter(origin.line - 1, origin.column - 1),
      file.getPositionOfLineAndCharacter(origin.endLine - 1, origin.endColumn - 1)) ?? "";
  }

  arguments(call: ts.CallExpression, code: BunwireCompilerError["code"]): readonly StaticValue[] {
    this.allowDecorator(call);
    const values: StaticValue[] = [];
    for (const argument of call.arguments) {
      if (ts.isSpreadElement(argument)) {
        const spread = this.resolve(argument.expression, code);
        if (spread.kind !== "array") throw new BunwireCompilerError(code, "Policy spread arguments require a known array.", { location: spread.origin });
        for (const value of spread.items) values.push(value);
      } else values.push(this.resolve(argument, code));
    }
    return Object.freeze(values);
  }

  work(node: ts.Node, depth = 1, count = 1): void { this.resolver.consumePolicyWork(node, depth, count); }
  emitDeclaration(node: ts.Node): void { this.resolver.emitDeclaration(node); }

  resolve(expression: ts.Expression, code: BunwireCompilerError["code"] = "DECORATOR_ARGUMENT_INVALID"): StaticValue {
    try {
      const result = this.resolver.resolve(expression);
      for (const file of result.dependencies) this.dependencies.add(file);
      this.provenance.push(...result.provenance);
      return result.value;
    } catch (cause) {
      if (cause instanceof BunwireCompilerError) throw new BunwireCompilerError(code, cause.message,
        { ...(cause.location ? { location: cause.location } : {}), cause });
      throw cause;
    }
  }

  data(expression: ts.Expression, code: BunwireCompilerError["code"] = "DECORATOR_ARGUMENT_INVALID"): unknown {
    return this.materialize(this.resolve(expression, code), code);
  }

  materialize(value: StaticValue, code: BunwireCompilerError["code"] = "DECORATOR_ARGUMENT_INVALID"): unknown {
    const materialize = (value: StaticValue): unknown => {
      switch (value.kind) {
        case "scalar": return value.value;
        case "array": return Object.freeze(value.items.map(materialize));
        case "object": {
          const result: Record<string, unknown> = {};
          for (const [key, item] of Object.entries(value.properties)) Object.defineProperty(result, key,
            { value: materialize(item), enumerable: true, writable: false, configurable: false });
          return Object.freeze(result);
        }
        case "reference": throw new BunwireCompilerError(code,
          "Canonical class/token references cannot be serialized as metadata data; use the documented canonical reference argument.", { location: value.origin });
      }
    };
    return materialize(value);
  }

  validateMutations(): void { this.resolver.validateMutations(); }
}
