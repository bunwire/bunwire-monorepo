import path from "node:path";
import ts from "typescript";
import {
  applicationCallChain,
  collectImportBindings,
  unwrapBootstrapExpression,
} from "./bootstrap-discovery.js";
import { BunwireCompilerError, type BunwireSourceLocation } from "./diagnostics.js";
import { canonicalCompilerPath } from "./path-identity.js";
import type { ManagedMetadataResolver } from "./managed-metadata.js";
import type { StaticValue } from "./static-expression.js";
import { StaticPolicyHelpers } from "./static-policy-helpers.js";

export interface MiddlewarePolicyGroupSyntax {
  readonly name: string;
  readonly references: readonly StaticValue[];
  readonly node: ts.Node;
  readonly origin: BunwireSourceLocation;
}

export interface MiddlewareControllerMappingSyntax {
  readonly pattern: string;
  readonly references: readonly StaticValue[];
  readonly node: ts.Node;
  readonly origin: BunwireSourceLocation;
  readonly helperPath?: string;
}

export interface MiddlewarePolicySyntax {
  readonly node?: ts.Node;
  readonly configured: boolean;
  readonly global: readonly StaticValue[];
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

function referenceArray(value: StaticValue, label: string): readonly StaticValue[] {
  if (value.kind !== "array") {
    throw new BunwireCompilerError("MIDDLEWARE_POLICY_INVALID", `${label} must resolve to a middleware reference array.`, { location: value.origin });
  }
  if (value.items.length === 0) {
    throw new BunwireCompilerError("MIDDLEWARE_POLICY_INVALID", `${label} must contain at least one middleware reference.`, { location: value.origin });
  }
  return value.items;
}

export function analyzeMiddlewarePolicySyntax(
  program: ts.Program,
  bootstrapPath: string | undefined,
  metadata: ManagedMetadataResolver,
): MiddlewarePolicySyntax {
  if (!bootstrapPath) return EMPTY_POLICY;
  const normalized = canonicalCompilerPath(bootstrapPath);
  const sourceFile = program.getSourceFiles().find((candidate) => (
    canonicalCompilerPath(candidate.fileName) === normalized
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
  if (!(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)
    || ts.isIdentifier(callback) || ts.isPropertyAccessExpression(callback))) {
    fail(
      "withMiddlewares() requires a synchronous callback or a named policy helper.",
      callbackExpression,
    );
  }
  const helpers = new StaticPolicyHelpers(program, metadata, "MIDDLEWARE_POLICY_INVALID");
  const global: StaticValue[] = [];
  const groups: MiddlewarePolicyGroupSyntax[] = [];
  const controllers: MiddlewareControllerMappingSyntax[] = [];
  const groupNames = new Set<string>();

  helpers.expand(callbackExpression, policyCall, (statement) => {
    const expression = unwrapBootstrapExpression(statement.expression);
    if (!ts.isCallExpression(expression)) {
      fail("Middleware policy statements must call registry.use(), registry.group(), or registry.controllers().", statement);
    }
    const called = unwrapBootstrapExpression(expression.expression);
    if (!ts.isPropertyAccessExpression(called)
      || called.questionDotToken
      || !helpers.isRegistry(called.expression)) {
      fail("Middleware policy calls must directly target the callback registry parameter.", expression.expression);
    }
    if (expression.questionDotToken) fail("Middleware policy calls must be non-optional.", expression);
    if (!["use", "group", "controllers"].includes(called.name.text)) fail(`Unsupported middleware policy call registry.${called.name.text}().`, called.name);
    const arguments_ = metadata.arguments(expression, "MIDDLEWARE_POLICY_INVALID")
      .map((value) => helpers.annotate(value, expression));
    switch (called.name.text) {
      case "use": {
        if (arguments_.length === 0) {
          fail("registry.use() requires at least one middleware reference.", expression);
        }
        for (const value of arguments_) global.push(value);
        break;
      }
      case "group": {
        const nameValue = arguments_[0];
        const referencesValue = arguments_[1];
        if (arguments_.length !== 2 || !nameValue || !referencesValue) {
          fail("registry.group() requires a static string name and one reference array.", expression);
        }
        if (nameValue.kind !== "scalar" || typeof nameValue.value !== "string")
          throw new BunwireCompilerError("MIDDLEWARE_POLICY_INVALID", "Middleware group names must resolve to strings.", { location: nameValue.origin });
        const name = nameValue.value.trim();
        if (name.length === 0) {
          throw new BunwireCompilerError("MIDDLEWARE_POLICY_INVALID", "Middleware group names must not be empty.", { location: nameValue.origin });
        }
        if (groupNames.has(name)) {
          throw new BunwireCompilerError("MIDDLEWARE_POLICY_INVALID", `Middleware group ${JSON.stringify(name)} is declared more than once.`, { location: nameValue.origin });
        }
        groupNames.add(name);
        metadata.emitDeclaration(expression);
        groups.push(Object.freeze({
          name,
          references: referenceArray(referencesValue, `Middleware group ${JSON.stringify(name)}`),
          node: expression,
          origin: nameValue.origin,
        }));
        break;
      }
      case "controllers": {
        const mapping = arguments_[0];
        if (arguments_.length !== 1 || !mapping) {
          fail("registry.controllers() requires one static object mapping.", expression);
        }
        if (mapping.kind !== "object") {
          throw new BunwireCompilerError("MIDDLEWARE_POLICY_INVALID", "registry.controllers() requires one static object mapping.", { location: mapping.origin });
        }
        for (const [pattern, value] of Object.entries(mapping.properties)) {
          controllers.push(Object.freeze({
            pattern,
            references: value.kind === "array" ? referenceArray(value, `Controller mapping ${JSON.stringify(pattern)}`) : Object.freeze([value]),
            node: expression,
            origin: mapping.keyOrigins[pattern]!,
            ...(mapping.helperPath ? { helperPath: mapping.helperPath } : {}),
          }));
        }
        break;
      }
      default:
        fail(`Unsupported middleware policy call registry.${called.name.text}().`, called.name);
    }
  });
  return Object.freeze({
    node: policyCall,
    configured: true,
    global: Object.freeze(global),
    groups: Object.freeze(groups),
    controllers: Object.freeze(controllers),
  });
}
