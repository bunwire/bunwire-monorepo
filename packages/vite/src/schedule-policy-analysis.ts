import path from "node:path";
import ts from "typescript";
import { applicationCallChain, collectImportBindings, unwrapBootstrapExpression } from "./bootstrap-discovery.js";
import { BunwireCompilerError, type BunwireSourceLocation } from "./diagnostics.js";
import { canonicalCompilerPath } from "./path-identity.js";

export interface ScheduleCallSyntax { readonly name: string; readonly arguments: readonly ts.Expression[]; readonly node: ts.CallExpression }
export interface ScheduleEntrySyntax {
  readonly execution: "direct" | "job";
  readonly target: ts.Expression;
  readonly arguments: readonly ts.Expression[];
  readonly calls: readonly ScheduleCallSyntax[];
  readonly node: ts.ExpressionStatement;
}
export interface SchedulePolicySyntax { readonly configured: boolean; readonly entries: readonly ScheduleEntrySyntax[] }
const EMPTY: SchedulePolicySyntax = Object.freeze({ configured: false, entries: Object.freeze([]) });
function locationOf(node: ts.Node): BunwireSourceLocation {
  const source = node.getSourceFile(); const start = source.getLineAndCharacterOfPosition(node.getStart(source)); const end = source.getLineAndCharacterOfPosition(node.getEnd());
  return Object.freeze({ filePath: path.resolve(source.fileName), line: start.line + 1, column: start.character + 1, endLine: end.line + 1, endColumn: end.character + 1 });
}
function fail(message: string, node: ts.Node): never { throw new BunwireCompilerError("SCHEDULE_POLICY_INVALID", message, { location: locationOf(node) }); }

export function analyzeSchedulePolicySyntax(program: ts.Program, bootstrapPath: string | undefined): SchedulePolicySyntax {
  if (!bootstrapPath) return EMPTY;
  const source = program.getSourceFiles().find((candidate) => canonicalCompilerPath(candidate.fileName) === canonicalCompilerPath(bootstrapPath));
  if (!source) throw new BunwireCompilerError("SCHEDULE_POLICY_INVALID", `Schedule bootstrap "${bootstrapPath}" is not part of the TypeScript Program.`, { filePath: bootstrapPath });
  const exported = source.statements.filter((entry): entry is ts.ExportAssignment => ts.isExportAssignment(entry) && !entry.isExportEquals);
  if (exported.length !== 1) fail("Schedule policy requires exactly one default-exported Application chain.", source);
  const applicationCalls = applicationCallChain(exported[0]!.expression, collectImportBindings(source), source.fileName);
  for (const call of applicationCalls) {
    const expression = unwrapBootstrapExpression(call.expression);
    if (ts.isElementAccessExpression(expression) && ts.isStringLiteral(expression.argumentExpression) && expression.argumentExpression.text === "withSchedule") {
      fail("withSchedule() must use direct non-computed property access.", call);
    }
  }
  const calls = applicationCalls.filter((call) => {
    const expression = unwrapBootstrapExpression(call.expression);
    return ts.isPropertyAccessExpression(expression) && expression.name.text === "withSchedule";
  });
  if (!calls.length) return EMPTY;
  if (calls.length > 1) fail("The exported Application chain may contain at most one withSchedule() block.", calls[1]!);
  const policyCall = calls[0]!; const property = unwrapBootstrapExpression(policyCall.expression);
  if (!ts.isPropertyAccessExpression(property) || property.questionDotToken || policyCall.questionDotToken) fail("withSchedule() must use direct non-optional property access.", policyCall);
  const callbackExpression = policyCall.arguments[0]; const callback = callbackExpression && unwrapBootstrapExpression(callbackExpression);
  if (policyCall.arguments.length !== 1 || !callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))
    || callback.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) || callback.asteriskToken
    || callback.parameters.length !== 1 || !ts.isIdentifier(callback.parameters[0]!.name) || !ts.isBlock(callback.body)) {
    fail("withSchedule() requires one synchronous direct callback with an identifier parameter and block body.", policyCall);
  }
  const registryName = callback.parameters[0]!.name.text; const entries: ScheduleEntrySyntax[] = [];
  for (const statement of callback.body.statements) {
    if (!ts.isExpressionStatement(statement)) fail("Schedule callbacks may contain only direct fluent schedule expressions.", statement);
    let current = unwrapBootstrapExpression(statement.expression); const fluent: ScheduleCallSyntax[] = []; let rooted = false;
    while (ts.isCallExpression(current)) {
      if (current.questionDotToken || current.arguments.some(ts.isSpreadElement)) fail("Schedule expressions do not support optional calls or spread arguments.", current);
      const called = unwrapBootstrapExpression(current.expression);
      if (!ts.isPropertyAccessExpression(called) || called.questionDotToken) fail("Schedule expressions require direct fluent property calls.", current);
      if (ts.isIdentifier(called.expression) && called.expression.text === registryName) {
        if (called.name.text !== "job" && called.name.text !== "task") fail(`Unsupported schedule registry method ${called.name.text}().`, called.name);
        const target = current.arguments[0];
        if (!target || (called.name.text === "task" && current.arguments.length !== 1)) fail(`schedule.${called.name.text}() requires ${called.name.text === "task" ? "one target" : "a target and optional static arguments"}.`, current);
        const cadenceNames = fluent.filter((entry) => ["cron", "everyMinute", "hourlyAt", "dailyAt"].includes(entry.name));
        if (cadenceNames.length !== 1) fail("Every central schedule requires exactly one cadence call.", statement);
        const modifierNames = new Set<string>();
        for (const entry of fluent) {
          if (!["cron", "everyMinute", "hourlyAt", "dailyAt", "id", "timezone", "withoutOverlapping", "onOneServer", "lockFor"].includes(entry.name)) fail(`Unsupported schedule builder method ${entry.name}().`, entry.node);
          if (modifierNames.has(entry.name)) fail(`Schedule builder method ${entry.name}() may only be used once.`, entry.node);
          modifierNames.add(entry.name);
        }
        entries.push(Object.freeze({ execution: called.name.text === "job" ? "job" : "direct", target, arguments: Object.freeze(current.arguments.slice(1)), calls: Object.freeze(fluent.reverse()), node: statement }));
        rooted = true; break;
      }
      fluent.push(Object.freeze({ name: called.name.text, arguments: Object.freeze([...current.arguments]), node: current }));
      current = unwrapBootstrapExpression(called.expression);
    }
    if (!rooted) fail("Schedule expressions must begin with the callback's schedule.job() or schedule.task().", statement);
  }
  return Object.freeze({ configured: true, entries: Object.freeze(entries) });
}
