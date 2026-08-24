import path from "node:path";
import ts from "typescript";
import {
  applicationCallChain,
  collectImportBindings,
  unwrapBootstrapExpression,
} from "./bootstrap-discovery.js";
import { BunwireCompilerError, type BunwireSourceLocation } from "./diagnostics.js";

export interface MiddlewarePolicyGroupSyntax {
  readonly name: string;
  readonly references: readonly ts.Expression[];
  readonly node: ts.StringLiteral;
}

export interface MiddlewareControllerMappingSyntax {
  readonly pattern: string;
  readonly references: readonly ts.Expression[];
  readonly node: ts.StringLiteral;
}

export interface MiddlewarePolicySyntax {
  readonly configured: boolean;
  readonly global: readonly ts.Expression[];
  readonly groups: readonly MiddlewarePolicyGroupSyntax[];
  readonly controllers: readonly MiddlewareControllerMappingSyntax[];
}

const EMPTY_POLICY: MiddlewarePolicySyntax = Object.freeze({
  configured: false,
  global: Object.freeze([]),
  groups: Object.freeze([]),
  controllers: Object.freeze([]),
});

function locationOf(node: ts.Node): BunwireSourceLocation {
  const sourceFile = node.getSourceFile();
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return Object.freeze({
    filePath: path.resolve(sourceFile.fileName),
    line: start.line + 1,
    column: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  });
}

function fail(message: string, node: ts.Node): never {
  throw new BunwireCompilerError("MIDDLEWARE_POLICY_INVALID", message, {
    location: locationOf(node),
  });
}

function directReferenceArray(expression: ts.Expression, label: string): readonly ts.Expression[] {
  const value = unwrapBootstrapExpression(expression);
  if (!ts.isArrayLiteralExpression(value) || value.elements.some(ts.isSpreadElement)) {
    fail(`${label} must be a direct array literal without spreads.`, expression);
  }
  if (value.elements.length === 0) {
    fail(`${label} must contain at least one middleware reference.`, expression);
  }
  return Object.freeze([...value.elements]);
}

function directMappingReferences(expression: ts.Expression, label: string): readonly ts.Expression[] {
  const value = unwrapBootstrapExpression(expression);
  if (ts.isArrayLiteralExpression(value)) {
    return directReferenceArray(value, label);
  }
  if (ts.isSpreadElement(value)) {
    fail(`${label} does not support spread references.`, value);
  }
  return Object.freeze([value]);
}

export function analyzeMiddlewarePolicySyntax(
  program: ts.Program,
  bootstrapPath: string | undefined,
): MiddlewarePolicySyntax {
  if (!bootstrapPath) return EMPTY_POLICY;
  const normalized = path.resolve(bootstrapPath).replaceAll("\\", "/").toLowerCase();
  const sourceFile = program.getSourceFiles().find((candidate) => (
    path.resolve(candidate.fileName).replaceAll("\\", "/").toLowerCase() === normalized
  ));
  if (!sourceFile) {
    throw new BunwireCompilerError(
      "MIDDLEWARE_POLICY_INVALID",
      `Middleware policy bootstrap "${bootstrapPath}" is not part of the TypeScript Program.`,
      { filePath: bootstrapPath },
    );
  }
  const exports = sourceFile.statements.filter((statement): statement is ts.ExportAssignment => (
    ts.isExportAssignment(statement) && !statement.isExportEquals
  ));
  if (exports.length !== 1) {
    fail("Middleware policy requires exactly one default-exported Application chain.", sourceFile);
  }
  const calls = applicationCallChain(
    exports[0]!.expression,
    collectImportBindings(sourceFile),
    sourceFile.fileName,
  );
  const computedPolicyCall = calls.find((call) => (
    ts.isElementAccessExpression(unwrapBootstrapExpression(call.expression))
  ));
  if (computedPolicyCall) {
    fail("withMiddlewares() must use direct non-computed property access.", computedPolicyCall.expression);
  }
  const policyCalls = calls.filter((call) => {
    const called = unwrapBootstrapExpression(call.expression);
    return ts.isPropertyAccessExpression(called) && called.name.text === "withMiddlewares";
  });
  if (policyCalls.length === 0) return EMPTY_POLICY;
  if (policyCalls.length > 1) {
    fail("The exported Application chain may contain at most one withMiddlewares() block.", policyCalls[1]!);
  }
  const policyCall = policyCalls[0]!;
  const calledPolicy = unwrapBootstrapExpression(policyCall.expression) as ts.PropertyAccessExpression;
  if (policyCall.questionDotToken || calledPolicy.questionDotToken) {
    fail("withMiddlewares() must use direct non-optional property access.", policyCall.expression);
  }
  const callbackExpression = policyCall.arguments[0];
  if (policyCall.arguments.length !== 1 || !callbackExpression) {
    fail("withMiddlewares() requires one direct configuration callback.", policyCall);
  }
  const callback = unwrapBootstrapExpression(callbackExpression);
  if ((!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))
    || callback.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
    || callback.asteriskToken
    || callback.parameters.length !== 1
    || !ts.isIdentifier(callback.parameters[0]!.name)
    || !ts.isBlock(callback.body)) {
    fail(
      "withMiddlewares() requires a synchronous direct callback with one identifier parameter and a block body.",
      callbackExpression,
    );
  }
  const registryName = callback.parameters[0]!.name.text;
  const global: ts.Expression[] = [];
  const groups: MiddlewarePolicyGroupSyntax[] = [];
  const controllers: MiddlewareControllerMappingSyntax[] = [];
  const groupNames = new Set<string>();

  for (const statement of callback.body.statements) {
    if (!ts.isExpressionStatement(statement)) {
      fail("Middleware policy callbacks may contain only direct registry call expression statements.", statement);
    }
    const expression = unwrapBootstrapExpression(statement.expression);
    if (!ts.isCallExpression(expression)) {
      fail("Middleware policy statements must call registry.use(), registry.group(), or registry.controllers().", statement);
    }
    const called = unwrapBootstrapExpression(expression.expression);
    if (!ts.isPropertyAccessExpression(called)
      || called.questionDotToken
      || !ts.isIdentifier(called.expression)
      || called.expression.text !== registryName) {
      fail("Middleware policy calls must directly target the callback registry parameter.", expression.expression);
    }
    if (expression.arguments.some(ts.isSpreadElement)) {
      fail("Middleware policy calls do not support spread arguments.", expression);
    }
    switch (called.name.text) {
      case "use": {
        if (expression.arguments.length === 0) {
          fail("registry.use() requires at least one middleware reference.", expression);
        }
        global.push(...expression.arguments);
        break;
      }
      case "group": {
        const nameExpression = expression.arguments[0];
        const referencesExpression = expression.arguments[1];
        if (expression.arguments.length !== 2
          || !nameExpression
          || !ts.isStringLiteral(nameExpression)
          || !referencesExpression) {
          fail("registry.group() requires a direct string name and one direct reference array.", expression);
        }
        const name = nameExpression.text.trim();
        if (name.length === 0) {
          fail("Middleware group names must not be empty.", nameExpression);
        }
        if (groupNames.has(name)) {
          fail(`Middleware group ${JSON.stringify(name)} is declared more than once.`, nameExpression);
        }
        groupNames.add(name);
        groups.push(Object.freeze({
          name,
          references: directReferenceArray(referencesExpression, `Middleware group ${JSON.stringify(name)}`),
          node: nameExpression,
        }));
        break;
      }
      case "controllers": {
        const mappingExpression = expression.arguments[0];
        if (expression.arguments.length !== 1 || !mappingExpression) {
          fail("registry.controllers() requires one direct object-literal mapping.", expression);
        }
        const mapping = unwrapBootstrapExpression(mappingExpression);
        if (!ts.isObjectLiteralExpression(mapping)) {
          fail("registry.controllers() requires one direct object-literal mapping.", mappingExpression);
        }
        for (const property of mapping.properties) {
          if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name)) {
            fail("Controller mappings require explicit string-literal properties without spreads or computed names.", property);
          }
          controllers.push(Object.freeze({
            pattern: property.name.text,
            references: directMappingReferences(
              property.initializer,
              `Controller mapping ${JSON.stringify(property.name.text)}`,
            ),
            node: property.name,
          }));
        }
        break;
      }
      default:
        fail(`Unsupported middleware policy call registry.${called.name.text}().`, called.name);
    }
  }
  return Object.freeze({
    configured: true,
    global: Object.freeze(global),
    groups: Object.freeze(groups),
    controllers: Object.freeze(controllers),
  });
}
