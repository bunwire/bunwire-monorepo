import ts from "typescript";
import { BunwireCompilerError, type BunwireSourceLocation } from "./diagnostics.js";
import { StaticExpressionResolver, type StaticValue } from "./static-expression.js";

/** Analysis-local bridge: feature validators receive data, never compiler reference leaves. */
export class ManagedMetadataResolver {
  private readonly consumers = new Set<ts.CallExpression>();
  private readonly resolver: StaticExpressionResolver;
  readonly dependencies = new Set<string>();
  readonly provenance: BunwireSourceLocation[] = [];

  constructor(program: ts.Program, projectRoot: string) {
    this.resolver = new StaticExpressionResolver({ program, projectRoot, deferMutationChecks: true,
      isMetadataConsumer: (call) => ts.isCallExpression(call) && this.consumers.has(call) });
  }

  allowDecorator(call: ts.CallExpression | undefined): void {
    if (call) this.consumers.add(call);
  }

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
    return materialize(this.resolve(expression, code));
  }

  validateMutations(): void { this.resolver.validateMutations(); }
}
