import type { Rule, RuleContext, RuleFailure, RuleInvocation, RuleOutcome } from "./types.js";

const pass = (): RuleOutcome => ({ valid: true });
const failure = (parameters?: Readonly<Record<string, unknown>>): RuleFailure => parameters === undefined ? { valid: false } : { valid: false, parameters };
const skip = (): RuleOutcome => ({ valid: true, skipRemaining: true });

function numericArgument(context: RuleContext, position = 0): number {
  const raw = context.arguments[position];
  const value = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Rule "${context.attribute}" requires a numeric argument at position ${position}.`);
  return value;
}

function measure(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" || Array.isArray(value)) return value.length;
  return undefined;
}

function hasRequiredValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0);
}

export const required: Rule = {
  name: "required", defaultMessage: "The :attribute field is required.", runsOnAbsent: true, runsOnNull: true, runsWhenSkipped: true,
  caller: ({ value }) => hasRequiredValue(value) ? pass() : failure(),
};
export const optional: Rule = {
  name: "optional", runsOnAbsent: true, runsWhenSkipped: true,
  caller: ({ present }) => present ? pass() : skip(),
};
export const nullable: Rule = {
  name: "nullable", runsOnNull: true, runsWhenSkipped: true,
  caller: ({ value }) => value === null ? skip() : pass(),
};
export const string: Rule = { name: "string", defaultMessage: "The :attribute field must be a string.", caller: ({ value }) => typeof value === "string" ? pass() : failure() };
export const number: Rule = { name: "number", defaultMessage: "The :attribute field must be a number.", caller: ({ value }) => typeof value === "number" && Number.isFinite(value) ? pass() : failure() };
export const integer: Rule = { name: "integer", defaultMessage: "The :attribute field must be an integer.", caller: ({ value }) => typeof value === "number" && Number.isInteger(value) ? pass() : failure() };
export const boolean: Rule = { name: "boolean", defaultMessage: "The :attribute field must be a boolean.", caller: ({ value }) => typeof value === "boolean" ? pass() : failure() };
export const array: Rule = { name: "array", defaultMessage: "The :attribute field must be an array.", caller: ({ value }) => Array.isArray(value) ? pass() : failure() };
export const object: Rule = { name: "object", defaultMessage: "The :attribute field must be an object.", caller: ({ value }) => value !== null && typeof value === "object" && !Array.isArray(value) ? pass() : failure() };

export const min: Rule = {
  name: "min", defaultMessage: "The :attribute field must be at least :min.",
  caller: (context) => { const minimum = numericArgument(context); const value = measure(context.value); return value !== undefined && value >= minimum ? pass() : failure({ min: minimum }); },
};
export const max: Rule = {
  name: "max", defaultMessage: "The :attribute field may not be greater than :max.",
  caller: (context) => { const maximum = numericArgument(context); const value = measure(context.value); return value !== undefined && value <= maximum ? pass() : failure({ max: maximum }); },
};
export const between: Rule = {
  name: "between", defaultMessage: "The :attribute field must be between :min and :max.",
  caller: (context) => { const minimum = numericArgument(context); const maximum = numericArgument(context, 1); const value = measure(context.value); return value !== undefined && value >= minimum && value <= maximum ? pass() : failure({ min: minimum, max: maximum }); },
};
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const email: Rule = { name: "email", defaultMessage: "The :attribute field must be a valid email address.", caller: ({ value }) => typeof value === "string" && emailPattern.test(value) ? pass() : failure() };
export const url: Rule = { name: "url", defaultMessage: "The :attribute field must be a valid URL.", caller: ({ value }) => { if (typeof value !== "string") return failure(); try { new URL(value); return pass(); } catch { return failure(); } } };
export const inRule: Rule = { name: "in", defaultMessage: "The selected :attribute is invalid.", caller: ({ value, arguments: choices }) => choices.includes(String(value)) ? pass() : failure({ values: choices.join(",") }) };
export const notIn: Rule = { name: "notIn", defaultMessage: "The selected :attribute is invalid.", caller: ({ value, arguments: choices }) => !choices.includes(String(value)) ? pass() : failure({ values: choices.join(",") }) };
export const same: Rule = { name: "same", defaultMessage: "The :attribute field must match :other.", caller: (context) => { const other = context.arguments[0]; if (!other) throw new Error("The same rule requires another field path."); return context.value === context.get(other).value ? pass() : failure({ other }); } };
export const different: Rule = { name: "different", defaultMessage: "The :attribute field must be different from :other.", caller: (context) => { const other = context.arguments[0]; if (!other) throw new Error("The different rule requires another field path."); return context.value !== context.get(other).value ? pass() : failure({ other }); } };

type MembershipValue = string | number | boolean;

function invoke(alias: string, arguments_: readonly MembershipValue[]): RuleInvocation {
  return { alias, arguments: arguments_.map(String) };
}

/** Programmatic declarations for built-in rules that take arguments. */
export const rules = Object.freeze({
  min: (minimum: number): RuleInvocation => invoke("min", [minimum]),
  max: (maximum: number): RuleInvocation => invoke("max", [maximum]),
  between: (minimum: number, maximum: number): RuleInvocation => invoke("between", [minimum, maximum]),
  in: (...values: readonly MembershipValue[]): RuleInvocation => invoke("in", values),
  notIn: (...values: readonly MembershipValue[]): RuleInvocation => invoke("notIn", values),
  same: (path: string): RuleInvocation => invoke("same", [path]),
  different: (path: string): RuleInvocation => invoke("different", [path]),
});

export const builtInRules = Object.freeze([
  required, optional, nullable, string, number, integer, boolean, array, object,
  min, max, between, email, url, inRule, notIn, same, different,
] as const);
