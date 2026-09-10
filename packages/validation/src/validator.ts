import { AsyncRuleError, ValidationErrors } from "./errors.js";
import { formatPath, getPath, parsePath, setPath } from "./path.js";
import { RuleRegistry } from "./registry.js";
import { builtInRules } from "./rules.js";
import type { MessageMap, Rule, RuleCaller, RuleContext, RuleDefinitions, RuleEntry, RuleInvocation, RuleList, RuleOutcome, ValidationError, ValidationOptions, ValidationResult, ValidationState } from "./types.js";

interface CompiledRule<TData> { rule: Rule<TData>; arguments: readonly string[]; }
interface ExecutionStep<TData> {
  readonly rule: Rule<TData>;
  readonly context: RuleContext<TData>;
}

function isPromise(value: unknown): value is PromiseLike<unknown> {
  return value !== null && typeof value === "object" && typeof (value as { then?: unknown }).then === "function";
}

function parseNamedRule(entry: string): { alias: string; arguments: readonly string[] } {
  const [alias, rawArguments = ""] = entry.split(/:(.*)/s, 2);
  if (!alias) throw new Error("A rule alias must not be empty.");
  return { alias, arguments: rawArguments === "" ? [] : rawArguments.split(",") };
}

function entriesFor<TData>(definition: RuleList<TData>): readonly RuleEntry<TData>[] {
  if (typeof definition === "string") return definition.split("|").filter(Boolean);
  if (Array.isArray(definition)) return definition;
  return [definition as RuleEntry<TData>];
}

function asRule<TData>(entry: Rule<TData> | RuleCaller<TData>): Rule<TData> {
  if (typeof entry === "function") {
    const caller = entry as RuleCaller;
    return { name: caller.name || "inline", caller };
  }
  return entry;
}

function isRuleInvocation<TData>(entry: Exclude<RuleEntry<TData>, string>): entry is RuleInvocation {
  return typeof entry !== "function" && "alias" in entry && "arguments" in entry;
}

function displayValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function interpolate(template: string, values: Readonly<Record<string, unknown>>): string {
  return template.replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => key in values ? String(values[key]) : `:${key}`);
}

export function createDefaultRegistry(): RuleRegistry {
  return new RuleRegistry(builtInRules.map((rule) => [rule.name, rule] as const));
}

export class Validator {
  readonly registry: RuleRegistry;
  readonly #messages: MessageMap;
  readonly #attributes: Readonly<Record<string, string>>;

  constructor(options: { registry?: RuleRegistry; messages?: MessageMap; attributes?: Readonly<Record<string, string>> } = {}) {
    this.registry = options.registry?.fork() ?? createDefaultRegistry();
    this.#messages = options.messages ?? {};
    this.#attributes = options.attributes ?? {};
  }

  alias(alias: string, rule: Rule, options?: { override?: boolean }): this {
    this.registry.alias(alias, rule, options);
    return this;
  }

  validate<TData extends Record<string, unknown>, TOutput = Partial<TData>>(
    data: TData, definitions: RuleDefinitions<TData>, options: ValidationOptions = {},
  ): ValidationResult<TOutput> {
    return this.#runSync(this.#plan<TData, TOutput>(data, definitions, options));
  }

  validateAsync<TData extends Record<string, unknown>, TOutput = Partial<TData>>(
    data: TData, definitions: RuleDefinitions<TData>, options: ValidationOptions = {},
  ): Promise<ValidationResult<TOutput>> {
    return this.#runAsync(this.#plan<TData, TOutput>(data, definitions, options));
  }

  #compile<TData>(entry: RuleEntry<TData>): CompiledRule<TData> {
    if (typeof entry !== "string" && !isRuleInvocation(entry)) return { rule: asRule(entry), arguments: [] };
    const parsed = typeof entry === "string" ? parseNamedRule(entry) : entry;
    const rule = this.registry.resolve(parsed.alias);
    if (!rule) throw new Error(`Unknown validation rule alias "${parsed.alias}".`);
    return { rule, arguments: parsed.arguments };
  }

  #message<TData>(attribute: string, rule: Rule<TData>, args: readonly string[], value: unknown, failure: Extract<RuleOutcome, { valid: false }>, options: ValidationOptions): string {
    const key = `${attribute}.${rule.name}`;
    const template = options.messages?.[key] ?? options.messages?.[rule.name] ?? this.#messages[key] ?? this.#messages[rule.name] ?? failure.message ?? rule.defaultMessage ?? `The ${attribute} field is invalid.`;
    const parameters: Record<string, unknown> = { attribute: options.attributes?.[attribute] ?? this.#attributes[attribute] ?? attribute, value: displayValue(value) };
    args.forEach((argument, index) => { parameters[`arg${index}`] = argument; });
    Object.assign(parameters, failure.parameters ?? {});
    return interpolate(template, parameters);
  }

  *#plan<TData extends Record<string, unknown>, TOutput>(data: TData, definitions: RuleDefinitions<TData>, options: ValidationOptions): Generator<ExecutionStep<TData>, ValidationResult<TOutput>, RuleOutcome> {
    const errors: ValidationError[] = [];
    const values: Record<string, unknown> = {};
    const output: Record<string | number, unknown> = {};
    const state: ValidationState = { errors, values };
    for (const [attribute, definition] of Object.entries(definitions)) {
      const path = parsePath(attribute);
      const field = getPath(data, path);
      values[formatPath(path)] = field.value;
      let skipContent = false;
      for (const entry of entriesFor(definition)) {
        const { rule, arguments: args } = this.#compile(entry);
        if (skipContent && !rule.runsWhenSkipped) continue;
        if (!field.present && !rule.runsOnAbsent) continue;
        if (field.value === null && !rule.runsOnNull) continue;
        const context: RuleContext<TData> = { value: field.value, present: field.present, attribute, path, data, arguments: args, state, get: (otherPath) => getPath(data, otherPath) };
        const outcome = yield { rule, context };
        if (!outcome.valid) errors.push({ attribute, path, rule: rule.name, message: this.#message(attribute, rule, args, field.value, outcome, options), arguments: args, value: field.value, ...(outcome.code === undefined ? {} : { code: outcome.code }), ...(outcome.metadata === undefined ? {} : { metadata: outcome.metadata }) });
        else if (outcome.skipRemaining) skipContent = true;
      }
      if (field.present) setPath(output, path, field.value);
    }
    const collection = new ValidationErrors(errors);
    return errors.length === 0 ? { valid: true, data: output as TOutput, errors: collection } : { valid: false, errors: collection };
  }

  #runSync<TData, TOutput>(plan: Generator<ExecutionStep<TData>, ValidationResult<TOutput>, RuleOutcome>): ValidationResult<TOutput> {
    let step = plan.next();
    while (!step.done) {
      const outcome = step.value.rule.caller(step.value.context);
      if (isPromise(outcome)) throw new AsyncRuleError(step.value.rule.name);
      step = plan.next(outcome);
    }
    return step.value;
  }

  async #runAsync<TData, TOutput>(plan: Generator<ExecutionStep<TData>, ValidationResult<TOutput>, RuleOutcome>): Promise<ValidationResult<TOutput>> {
    let step = plan.next();
    while (!step.done) {
      const outcome = await step.value.rule.caller(step.value.context);
      step = plan.next(outcome);
    }
    return step.value;
  }
}

export function createValidator(options?: ConstructorParameters<typeof Validator>[0]): Validator { return new Validator(options); }
