import {
  createParameterResolverId,
  createToken,
  defineClassKind,
  defineCompilerMetadataHandler,
  defineManagedClassDecorator,
  defineMethodKind,
  defineParameterInjector,
  type ManagedClassCompilationHandlerData,
  type ManagedClassIdentityHandlerData,
  type Token,
} from "@bunwire/core";
import type { BunExecutionScope } from "./execution-scopes.js";

export class BunCommandError extends Error { override readonly name = "BunCommandError"; }

export type BunCommandValueType = "string" | "number" | "integer";
export type BunCommandValue = string | number;

export interface BunCommandOptions {
  readonly name: string;
  readonly description?: string;
}

export interface BunCommandDefinition extends BunCommandOptions {}

interface BunCommandInputBase {
  readonly name: string;
  readonly description?: string;
  readonly type?: BunCommandValueType;
  readonly required?: boolean;
  readonly default?: BunCommandValue;
  readonly choices?: readonly BunCommandValue[];
}

export interface BunCommandArgumentOptions extends BunCommandInputBase {}
export interface BunCommandOptionOptions extends BunCommandInputBase { readonly alias?: string }
export interface BunCommandFlagOptions {
  readonly name: string;
  readonly alias?: string;
  readonly description?: string;
}

export interface BunCommandArgumentDefinition {
  readonly kind: "argument";
  readonly name: string;
  readonly description?: string;
  readonly type: BunCommandValueType;
  readonly required: boolean;
  readonly default?: BunCommandValue;
  readonly choices?: readonly BunCommandValue[];
}
export interface BunCommandOptionDefinition extends Omit<BunCommandArgumentDefinition, "kind"> {
  readonly kind: "option";
  readonly alias?: string;
}
export interface BunCommandFlagDefinition {
  readonly kind: "flag";
  readonly name: string;
  readonly alias?: string;
  readonly description?: string;
}
export type BunCommandParameterDefinition = BunCommandArgumentDefinition | BunCommandOptionDefinition | BunCommandFlagDefinition;

export interface BunCommandIO {
  readonly stdout: (line: string) => void | Promise<void>;
  readonly stderr: (line: string) => void | Promise<void>;
}

export interface BunCommandContext {
  readonly name: string;
  readonly argv: readonly string[];
  readonly arguments: Readonly<Record<string, BunCommandValue | undefined>>;
  readonly options: Readonly<Record<string, BunCommandValue | boolean | undefined>>;
  readonly io: BunCommandIO;
  readonly signal: AbortSignal;
  readonly scope: BunExecutionScope;
}

export const BUN_COMMAND_CONTEXT: Token<BunCommandContext> = createToken<BunCommandContext>("bunwire.bun.command-context");
export const BUN_COMMAND_RUNTIME_ARGUMENT_RESOLVER_ID = createParameterResolverId("bun.command-argument");
export const BUN_COMMAND_RUNTIME_OPTION_RESOLVER_ID = createParameterResolverId("bun.command-option");
export const BUN_COMMAND_RUNTIME_FLAG_RESOLVER_ID = createParameterResolverId("bun.command-flag");

export const BUN_COMMAND_KIND = defineClassKind({
  id: "bun.command", injectable: true, autoDiscover: true, analyzeConstructor: true, managedMethods: true, registry: true,
});
export const BUN_COMMAND_HANDLE_KIND = defineMethodKind({ id: "bun.command.handle", allowedOn: [BUN_COMMAND_KIND], invocable: true });

const COMMAND_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;
const INPUT_NAME = /^[a-zA-Z][a-zA-Z0-9-]*$/;
const RESERVED_COMMANDS = Object.freeze([
  "help", "list", "serve", "routes:list", "events:list", "jobs:list", "queue:work", "queue:failed", "queue:retry", "queue:forget", "schedule:run", "schedule:list",
]);
export const BUN_FRAMEWORK_COMMAND_NAMES: readonly string[] = RESERVED_COMMANDS;

function ownKeys(value: object, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new BunCommandError(`${label} contains unknown property "${key}".`);
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) throw new BunCommandError(`${label} must be a non-empty trimmed string.`);
  return value;
}
export function compiledCommandDefinition(input: string | BunCommandOptions): BunCommandDefinition {
  const value = typeof input === "string" ? { name: input } : input;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BunCommandError("@Command requires a command name or options object.");
  ownKeys(value, ["name", "description"], "@Command options");
  const name = text(value.name, "Command name");
  if (!COMMAND_NAME.test(name)) throw new BunCommandError("Command names may contain only letters, digits, '.', '_', ':', and '-'.");
  const description = value.description === undefined ? undefined : text(value.description, "Command description");
  return Object.freeze({ name, ...(description === undefined ? {} : { description }) });
}

export const Command = defineManagedClassDecorator<string | BunCommandOptions, BunCommandDefinition, "bun.command-decorator">({
  id: "bun.command-decorator", kind: BUN_COMMAND_KIND,
  compilerSymbol: { moduleSpecifier: "@bunwire/bun", exportName: "Command" }, bare: false,
  createMetadata: compiledCommandDefinition,
  validateTarget(target) {
    if (typeof Object.getOwnPropertyDescriptor(target.prototype, "handle")?.value !== "function") throw new BunCommandError("@Command requires an own handle() method.");
  },
});

function inputDefinition(kind: "argument" | "option", input: string | BunCommandArgumentOptions | BunCommandOptionOptions): BunCommandArgumentDefinition | BunCommandOptionDefinition {
  const value = typeof input === "string" ? { name: input } : input;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BunCommandError(`@${kind === "argument" ? "Argument" : "Option"} requires a name or options object.`);
  ownKeys(value, kind === "option" ? ["name", "alias", "description", "type", "required", "default", "choices"] : ["name", "description", "type", "required", "default", "choices"], `@${kind === "argument" ? "Argument" : "Option"} options`);
  const name = text(value.name, `${kind} name`);
  if (!INPUT_NAME.test(name) || name === "help") throw new BunCommandError(`${kind} name is invalid or reserved.`);
  const type = value.type ?? "string";
  if (type !== "string" && type !== "number" && type !== "integer") throw new BunCommandError(`${kind} type must be string, number, or integer.`);
  if (value.required !== undefined && typeof value.required !== "boolean") throw new BunCommandError(`${kind} required must be boolean.`);
  if (value.required === true && value.default !== undefined) throw new BunCommandError(`${kind} cannot be required and have a default.`);
  const validateValue = (entry: unknown, label: string): BunCommandValue => {
    if (type === "string" ? typeof entry !== "string" : typeof entry !== "number" || !Number.isFinite(entry) || (type === "integer" && !Number.isSafeInteger(entry))) {
      throw new BunCommandError(`${label} must match ${type}.`);
    }
    return entry as BunCommandValue;
  };
  const defaultValue = value.default === undefined ? undefined : validateValue(value.default, `${kind} default`);
  let choices: readonly BunCommandValue[] | undefined;
  if (value.choices !== undefined) {
    if (!Array.isArray(value.choices) || !value.choices.length) throw new BunCommandError(`${kind} choices must be a non-empty array.`);
    choices = Object.freeze(value.choices.map((entry) => validateValue(entry, `${kind} choice`)));
    if (new Set(choices).size !== choices.length) throw new BunCommandError(`${kind} choices must be unique.`);
    if (defaultValue !== undefined && !choices.includes(defaultValue)) throw new BunCommandError(`${kind} default must be one of its choices.`);
  }
  const description = value.description === undefined ? undefined : text(value.description, `${kind} description`);
  const alias = kind === "option" ? (value as BunCommandOptionOptions).alias : undefined;
  if (alias !== undefined && (typeof alias !== "string" || !/^[a-zA-Z0-9]$/.test(alias) || alias === "h")) throw new BunCommandError("Option alias must be one non-reserved letter or digit.");
  return Object.freeze({ kind, name, type, required: value.required ?? defaultValue === undefined,
    ...(alias === undefined ? {} : { alias }), ...(description === undefined ? {} : { description }),
    ...(defaultValue === undefined ? {} : { default: defaultValue }), ...(choices === undefined ? {} : { choices }) });
}

function flagDefinition(input: string | BunCommandFlagOptions): BunCommandFlagDefinition {
  const value = typeof input === "string" ? { name: input } : input;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BunCommandError("@Flag requires a name or options object.");
  ownKeys(value, ["name", "alias", "description"], "@Flag options");
  const name = text(value.name, "flag name");
  if (!INPUT_NAME.test(name) || name === "help") throw new BunCommandError("flag name is invalid or reserved.");
  if (value.alias !== undefined && (typeof value.alias !== "string" || !/^[a-zA-Z0-9]$/.test(value.alias) || value.alias === "h")) throw new BunCommandError("Flag alias must be one non-reserved letter or digit.");
  const description = value.description === undefined ? undefined : text(value.description, "flag description");
  return Object.freeze({ kind: "flag", name, ...(value.alias === undefined ? {} : { alias: value.alias }), ...(description === undefined ? {} : { description }) });
}

export const Argument = defineParameterInjector<string | BunCommandArgumentOptions, BunCommandArgumentDefinition, "bun.command-argument.decorator">({
  id: "bun.command-argument.decorator", compilerSymbol: { moduleSpecifier: "@bunwire/bun", exportName: "Argument" }, resolverId: BUN_COMMAND_RUNTIME_ARGUMENT_RESOLVER_ID,
  createMetadata: (input) => inputDefinition("argument", input) as BunCommandArgumentDefinition,
});
export const Option = defineParameterInjector<string | BunCommandOptionOptions, BunCommandOptionDefinition, "bun.command-option.decorator">({
  id: "bun.command-option.decorator", compilerSymbol: { moduleSpecifier: "@bunwire/bun", exportName: "Option" }, resolverId: BUN_COMMAND_RUNTIME_OPTION_RESOLVER_ID,
  createMetadata: (input) => inputDefinition("option", input) as BunCommandOptionDefinition,
});
export const Flag = defineParameterInjector<string | BunCommandFlagOptions, BunCommandFlagDefinition, "bun.command-flag.decorator">({
  id: "bun.command-flag.decorator", compilerSymbol: { moduleSpecifier: "@bunwire/bun", exportName: "Flag" }, resolverId: BUN_COMMAND_RUNTIME_FLAG_RESOLVER_ID,
  createMetadata: flagDefinition,
});

export function validateCommandParameterPlan(parameters: readonly { readonly methodIndex: number; readonly resolverId: string; readonly data: unknown }[]): void {
  const names = new Set<string>(); const aliases = new Set<string>(); let optionalArgument = false;
  for (const parameter of [...parameters].sort((left, right) => left.methodIndex - right.methodIndex)) {
    const raw = parameter.data as Partial<BunCommandParameterDefinition> | undefined;
    if (!raw || typeof raw !== "object") throw new BunCommandError("Command parameters require generated metadata.");
    const { kind: _kind, ...input } = raw;
    const definition = raw.kind === "argument" ? Argument.definition.createMetadata(input as BunCommandArgumentOptions)
      : raw.kind === "option" ? Option.definition.createMetadata(input as BunCommandOptionOptions)
        : raw.kind === "flag" ? Flag.definition.createMetadata(input as BunCommandFlagOptions) : undefined;
    if (!definition) throw new BunCommandError("Command parameter metadata kind is invalid.");
    const resolverId = definition.kind === "argument" ? BUN_COMMAND_RUNTIME_ARGUMENT_RESOLVER_ID : definition.kind === "option" ? BUN_COMMAND_RUNTIME_OPTION_RESOLVER_ID : BUN_COMMAND_RUNTIME_FLAG_RESOLVER_ID;
    if (parameter.resolverId !== resolverId) throw new BunCommandError("Command parameter resolver identity is noncanonical.");
    if (names.has(definition.name)) throw new BunCommandError(`Duplicate command input name "${definition.name}".`); names.add(definition.name);
    if (definition.kind === "argument") { if (!definition.required) optionalArgument = true; else if (optionalArgument) throw new BunCommandError("Required positional command arguments cannot follow optional arguments."); }
    else if (definition.alias) { if (aliases.has(definition.alias)) throw new BunCommandError(`Duplicate command input alias "-${definition.alias}".`); aliases.add(definition.alias); }
  }
}

export const BUN_COMMAND_COMPILATION_HANDLER = defineCompilerMetadataHandler({
  id: "bun.command-compilation", data: Object.freeze({
    type: "bunwire.managed-class-compilation", classKindIds: Object.freeze([BUN_COMMAND_KIND.id]), scope: "transient", properties: Object.freeze([]),
    compileMetadata: (data: unknown) => compiledCommandDefinition(data as string | BunCommandOptions),
    intrinsicMethods: Object.freeze([Object.freeze({ name: "handle", kind: BUN_COMMAND_HANDLE_KIND,
      compilerSymbol: Object.freeze({ moduleSpecifier: "@bunwire/bun", exportName: "BUN_COMMAND_HANDLE_KIND" }),
      parameters: Object.freeze({ resolverIds: Object.freeze([BUN_COMMAND_RUNTIME_ARGUMENT_RESOLVER_ID, BUN_COMMAND_RUNTIME_OPTION_RESOLVER_ID, BUN_COMMAND_RUNTIME_FLAG_RESOLVER_ID]), validateParameters: validateCommandParameterPlan }),
    })]),
  } satisfies ManagedClassCompilationHandlerData),
});
export const BUN_COMMAND_IDENTITY_HANDLER = defineCompilerMetadataHandler({
  id: "bun.command-identity", data: Object.freeze({
    type: "bunwire.managed-class-identity", classKindIds: Object.freeze([BUN_COMMAND_KIND.id]), reservedIdentities: RESERVED_COMMANDS,
    resolveIdentity: ({ data }) => compiledCommandDefinition(data as BunCommandDefinition).name,
  } satisfies ManagedClassIdentityHandlerData),
});
export const BUN_COMMAND_NO_CALLER_CONTRACT_HANDLER = defineCompilerMetadataHandler({
  id: "bun.command-no-caller-contract", data: Object.freeze({ type: "bunwire.no-caller-contract", methodKindIds: Object.freeze([BUN_COMMAND_HANDLE_KIND.id]) }),
});
