import {
  createToken,
  defineParameterResolver,
  getManagedClassMetadata,
  type Application,
  type ManagedMethodPlan,
  type RuntimeRegistry,
  type RuntimeRegistryConsumerContext,
  type Token,
} from "@bunwire/core";
import {
  BUN_COMMAND_CONTEXT,
  BUN_COMMAND_HANDLE_KIND,
  BUN_COMMAND_KIND,
  BUN_COMMAND_RUNTIME_ARGUMENT_RESOLVER_ID,
  BUN_COMMAND_RUNTIME_FLAG_RESOLVER_ID,
  BUN_COMMAND_RUNTIME_OPTION_RESOLVER_ID,
  BUN_FRAMEWORK_COMMAND_NAMES,
  Argument,
  Command,
  Flag,
  Option,
  compiledCommandDefinition,
  validateCommandParameterPlan,
  type BunCommandArgumentDefinition,
  type BunCommandContext,
  type BunCommandDefinition,
  type BunCommandFlagDefinition,
  type BunCommandIO,
  type BunCommandOptionDefinition,
  type BunCommandParameterDefinition,
  type BunCommandValue,
} from "./commands.js";
import { BUN_HTTP_ROUTE_KIND, bunHttpCompiledRoute } from "./http.js";
import { BUN_JOB_KIND, type BunJobDefinition } from "./jobs.js";
import type { BunExecutionScopeManager } from "./execution-scopes.js";
import type { QueueManager } from "./queue-manager.js";
import type { BunScheduler } from "./scheduler.js";
import { Queue } from "./queued-listeners.js";

export interface BunCliRunOptions {
  readonly argv?: readonly string[];
  readonly io?: BunCommandIO;
}

interface RegisteredCommand {
  readonly definition: BunCommandDefinition;
  readonly plan: ManagedMethodPlan;
  readonly parameters: readonly (BunCommandParameterDefinition & { readonly methodIndex: number })[];
}

interface CommandRuntimeOperations {
  readonly serve: () => Promise<void>;
  readonly work: () => Promise<void>;
}

const DEFAULT_IO: BunCommandIO = Object.freeze({
  stdout(line: string): void { console.log(line); },
  stderr(line: string): void { console.error(line); },
});

export const BUN_COMMAND_RUNTIME: Token<BunCommandRuntime> = createToken<BunCommandRuntime>("bunwire.bun.command-runtime");

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "Unknown command failure.";
  try {
    const descriptors = Object.getOwnPropertyDescriptors(error);
    const name = descriptors.name && "value" in descriptors.name && typeof descriptors.name.value === "string" ? descriptors.name.value : "Error";
    const message = descriptors.message && "value" in descriptors.message && typeof descriptors.message.value === "string" ? descriptors.message.value : "Command execution failed.";
    if (error instanceof AggregateError) return `${name}: ${message}\n${error.errors.map(errorText).join("\n")}`;
    return `${name}: ${message}`;
  } catch { return "Error: Command execution failed."; }
}

async function write(io: BunCommandIO, target: "stdout" | "stderr", line: string): Promise<void> { await io[target](line); }

function coerce(value: string, definition: BunCommandArgumentDefinition | BunCommandOptionDefinition): BunCommandValue {
  let result: BunCommandValue = value;
  if (definition.type === "number" || definition.type === "integer") {
    if (value.trim() !== value || value.length === 0) throw new Error(`Value for "${definition.name}" must be a ${definition.type}.`);
    result = Number(value);
    if (!Number.isFinite(result) || (definition.type === "integer" && !Number.isSafeInteger(result))) throw new Error(`Value for "${definition.name}" must be a ${definition.type}.`);
  }
  if (definition.choices && !definition.choices.includes(result)) throw new Error(`Value for "${definition.name}" must be one of: ${definition.choices.join(", ")}.`);
  return result;
}

function validateParameters(parameters: RegisteredCommand["parameters"]): void {
  const names = new Set<string>(); const aliases = new Set<string>(); let optionalArgument = false;
  for (const parameter of parameters) {
    if (names.has(parameter.name)) throw new Error(`Duplicate command input name "${parameter.name}".`); names.add(parameter.name);
    if (parameter.kind === "argument") {
      if (!parameter.required) optionalArgument = true;
      else if (optionalArgument) throw new Error("Required positional command arguments cannot follow optional arguments.");
    } else if (parameter.alias) {
      if (aliases.has(parameter.alias)) throw new Error(`Duplicate command input alias "-${parameter.alias}".`); aliases.add(parameter.alias);
    }
  }
}

interface ParsedCommand { readonly arguments: Readonly<Record<string, BunCommandValue | undefined>>; readonly options: Readonly<Record<string, BunCommandValue | boolean | undefined>> }
function parse(parameters: RegisteredCommand["parameters"], argv: readonly string[]): ParsedCommand {
  const args = parameters.filter((entry): entry is typeof entry & BunCommandArgumentDefinition => entry.kind === "argument");
  const named = parameters.filter((entry): entry is typeof entry & (BunCommandOptionDefinition | BunCommandFlagDefinition) => entry.kind !== "argument");
  const byName = new Map(named.map((entry) => [entry.name, entry])); const byAlias = new Map(named.filter((entry) => entry.alias).map((entry) => [entry.alias!, entry]));
  const positional: string[] = []; const values = new Map<string, BunCommandValue | boolean>(); let options = true;
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]!;
    if (options && value === "--") { options = false; continue; }
    if (options && value.startsWith("--")) {
      const equals = value.indexOf("="); const name = value.slice(2, equals < 0 ? undefined : equals); const definition = byName.get(name);
      if (!definition) throw new Error(`Unknown option "--${name}".`); if (values.has(definition.name)) throw new Error(`Option "--${name}" was supplied more than once.`);
      if (definition.kind === "flag") { if (equals >= 0) throw new Error(`Flag "--${name}" does not accept a value.`); values.set(definition.name, true); continue; }
      const raw = equals >= 0 ? value.slice(equals + 1) : argv[++index]; if (raw === undefined) throw new Error(`Option "--${name}" requires a value.`);
      values.set(definition.name, coerce(raw, definition)); continue;
    }
    if (options && value.startsWith("-") && value !== "-") {
      if (value.length !== 2) throw new Error(`Combined or malformed short option "${value}" is not supported.`);
      const definition = byAlias.get(value[1]!); if (!definition) throw new Error(`Unknown option "${value}".`); if (values.has(definition.name)) throw new Error(`Option "${value}" was supplied more than once.`);
      if (definition.kind === "flag") { values.set(definition.name, true); continue; }
      const raw = argv[++index]; if (raw === undefined) throw new Error(`Option "${value}" requires a value.`); values.set(definition.name, coerce(raw, definition)); continue;
    }
    positional.push(value);
  }
  if (positional.length > args.length) throw new Error(`Expected at most ${args.length} positional argument(s), received ${positional.length}.`);
  const argumentValues: Record<string, BunCommandValue | undefined> = {}; const optionValues: Record<string, BunCommandValue | boolean | undefined> = {};
  for (let index = 0; index < args.length; index++) { const definition = args[index]!; const raw = positional[index];
    const resolved = raw === undefined ? definition.default : coerce(raw, definition); if (resolved === undefined && definition.required) throw new Error(`Missing required argument "${definition.name}".`); argumentValues[definition.name] = resolved; values.set(definition.name, resolved as BunCommandValue); }
  for (const definition of named) { const resolved = values.has(definition.name) ? values.get(definition.name) : definition.kind === "flag" ? false : definition.default;
    if (resolved === undefined && definition.kind === "option" && definition.required) throw new Error(`Missing required option "--${definition.name}".`); optionValues[definition.name] = resolved; values.set(definition.name, resolved as BunCommandValue | boolean); }
  return Object.freeze({ arguments: Object.freeze(argumentValues), options: Object.freeze(optionValues) });
}

function usage(command: RegisteredCommand): string {
  const positional = command.parameters.filter((entry) => entry.kind === "argument").map((entry) => entry.required ? `<${entry.name}>` : `[${entry.name}]`);
  return [`Usage: bunwire ${command.definition.name}${positional.length ? ` ${positional.join(" ")}` : ""} [options]`, command.definition.description ?? "", ...command.parameters.map((entry) => {
    const name = entry.kind === "argument" ? entry.name : `${entry.alias ? `-${entry.alias}, ` : ""}--${entry.name}`;
    return `  ${name}${entry.description ? `  ${entry.description}` : ""}`;
  })].filter(Boolean).join("\n");
}

export class BunCommandRuntime {
  readonly #commands = new Map<string, RegisteredCommand>(); readonly #controller = new AbortController();
  readonly stopped: Promise<void>; #resolveStopped!: () => void;
  #registry: RuntimeRegistry | undefined; #invocation: RuntimeRegistryConsumerContext | undefined; #ran = false;
  constructor(private readonly application: Application, private readonly scopes: BunExecutionScopeManager, private readonly queues: QueueManager,
    private readonly scheduler: BunScheduler, private readonly operations: CommandRuntimeOperations) { this.stopped = new Promise((resolve) => { this.#resolveStopped = resolve; }); }
  consume(registry: RuntimeRegistry, invocation: RuntimeRegistryConsumerContext): void {
    this.#registry = registry; this.#invocation = invocation; this.#commands.clear();
    for (const entry of registry.classes) {
      if (entry.kind.id !== BUN_COMMAND_KIND.id) continue;
      const metadata = getManagedClassMetadata(entry.target); const definition = compiledCommandDefinition(entry.data as BunCommandDefinition);
      if (entry.kind !== BUN_COMMAND_KIND || entry.scope !== "transient" || metadata?.kindId !== BUN_COMMAND_KIND.id || metadata.decoratorId !== Command.definition.id
        || BUN_FRAMEWORK_COMMAND_NAMES.includes(definition.name)) throw new Error("Command registry requires canonical transient, non-reserved @Command classes.");
      const plans = registry.methods.filter((plan) => plan.target === entry.target); const plan = plans[0];
      if (plans.length !== 1 || !plan || plan.kind !== BUN_COMMAND_HANDLE_KIND || plan.ownerKind !== BUN_COMMAND_KIND || plan.method !== "handle") throw new Error("Command registry requires exactly one canonical handle plan.");
      validateCommandParameterPlan(plan.parameters.map((parameter) => Object.freeze({ methodIndex: parameter.methodIndex,
        resolverId: parameter.source === "resolver" ? parameter.resolverId : "", data: parameter.source === "resolver" ? parameter.data : undefined })));
      const parameters = plan.parameters.map((parameter) => { if (parameter.source !== "resolver" || !parameter.data || typeof parameter.data !== "object") throw new Error("Command handle plans require generated command parameter resolvers.");
        const raw = parameter.data as BunCommandParameterDefinition; const { kind: _kind, ...input } = raw;
        const definition = raw.kind === "argument" ? Argument.definition.createMetadata(input as BunCommandArgumentDefinition)
          : raw.kind === "option" ? Option.definition.createMetadata(input as BunCommandOptionDefinition) : raw.kind === "flag" ? Flag.definition.createMetadata(input as BunCommandFlagDefinition) : undefined;
        if (!definition) throw new Error("Command parameter metadata kind is invalid.");
        const expected = definition.kind === "argument" ? BUN_COMMAND_RUNTIME_ARGUMENT_RESOLVER_ID : definition.kind === "option" ? BUN_COMMAND_RUNTIME_OPTION_RESOLVER_ID : BUN_COMMAND_RUNTIME_FLAG_RESOLVER_ID;
        if (parameter.resolverId !== expected) throw new Error("Command parameter resolver identity is noncanonical."); return Object.freeze({ ...definition, methodIndex: parameter.methodIndex }); }).sort((left, right) => left.methodIndex - right.methodIndex);
      validateParameters(parameters); if (this.#commands.has(definition.name)) throw new Error(`Duplicate command identity "${definition.name}".`);
      this.#commands.set(definition.name, Object.freeze({ definition, plan, parameters }));
    }
  }
  beginShutdown(): void { if (!this.#controller.signal.aborted) { this.#controller.abort(new Error("Bun command runtime stopped.")); this.#resolveStopped(); } }
  async run(argv: readonly string[], io: BunCommandIO = DEFAULT_IO): Promise<number> {
    if (this.#ran) { await write(io, "stderr", "Error: Bun command runtime may run only once."); return 1; } this.#ran = true;
    if (!this.#registry || !this.#invocation || !Array.isArray(argv) || typeof io?.stdout !== "function" || typeof io?.stderr !== "function") { await write(io ?? DEFAULT_IO, "stderr", "Error: Bun command runtime is not initialized or received malformed input."); return 1; }
    const [name, ...tail] = argv;
    if (!name || name === "list" || name === "--help" || name === "-h") { await this.#writeList(io); return 0; }
    if (name === "help") { const command = tail[0]; if (!command) { await this.#writeList(io); return 0; } return this.#writeHelp(command, io); }
    const applicationCommand = this.#commands.get(name); const framework = this.#framework(name);
    if (!applicationCommand && !framework) { await write(io, "stderr", `Unknown command "${name}".`); return 2; }
    if (tail.includes("--help") || tail.includes("-h")) return applicationCommand ? (await write(io, "stdout", usage(applicationCommand)), 0) : this.#writeFrameworkHelp(name, io);
    try {
      return await this.scopes.run("command", async (scope) => {
        if (applicationCommand) {
          const parsed = parse(applicationCommand.parameters, tail); const context = Object.freeze({ name, argv: Object.freeze([...tail]), arguments: parsed.arguments, options: parsed.options, io, signal: this.#controller.signal, scope });
          scope.value(BUN_COMMAND_CONTEXT, context); const result = await this.application.invokeManagedMethod(applicationCommand.plan, [], { parentContainer: scope.container });
          if (result === undefined) return 0; if (!Number.isSafeInteger(result) || (result as number) < 0 || (result as number) > 255) throw new Error("Command handlers must return void or an integer exit code from 0 through 255."); return result as number;
        }
        const context = Object.freeze({ name, argv: Object.freeze([...tail]), arguments: Object.freeze({}), options: Object.freeze({}), io, signal: this.#controller.signal, scope }); scope.value(BUN_COMMAND_CONTEXT, context);
        return await framework!(tail, io);
      });
    } catch (error) { const usageFailure = error instanceof Error && /^(Unknown option|Option |Flag |Value |Expected |Missing required|Combined)/.test(error.message); await write(io, "stderr", errorText(error)); return usageFailure ? 2 : 1; }
  }
  async #writeList(io: BunCommandIO): Promise<void> { await write(io, "stdout", ["Usage: bunwire <command> [arguments] [options]", "", "Commands:", ...[...BUN_FRAMEWORK_COMMAND_NAMES, ...this.#commands.keys()].sort().map((name) => `  ${name}`)].join("\n")); }
  async #writeHelp(name: string, io: BunCommandIO): Promise<number> { if (name === "list" || name === "help") { await this.#writeList(io); return 0; } const command = this.#commands.get(name); if (command) { await write(io, "stdout", usage(command)); return 0; } if (this.#framework(name)) return this.#writeFrameworkHelp(name, io); await write(io, "stderr", `Unknown command "${name}".`); return 2; }
  async #writeFrameworkHelp(name: string, io: BunCommandIO): Promise<number> { const suffix: Record<string, string> = { "queue:retry": " <id>", "queue:forget": " <id>" }; await write(io, "stdout", `Usage: bunwire ${name}${suffix[name] ?? ""}`); return 0; }
  #framework(name: string): ((argv: readonly string[], io: BunCommandIO) => Promise<number>) | undefined {
    const registry = this.#registry!; const exact = (argv: readonly string[], count: number) => { if (argv.length !== count) throw new Error(`Expected ${count} positional argument(s), received ${argv.length}.`); };
    switch (name) {
      case "serve": return async (argv) => { exact(argv, 0); await this.operations.serve(); return 0; };
      case "queue:work": return async (argv) => { exact(argv, 0); await this.operations.work(); return 0; };
      case "routes:list": return async (argv, io) => { exact(argv, 0); const rows = registry.methods.filter((plan) => plan.kind === BUN_HTTP_ROUTE_KIND).map((plan) => { const owner = registry.classes.find((entry) => entry.target === plan.target)!; const route = bunHttpCompiledRoute({ ownerKindId: owner.kind.id, ownerData: owner.data, methodData: plan.data, transportParameterCount: plan.parameters.filter((entry) => entry.source === "transport").length }); return `${route.method}\t${route.path}\t${plan.target.name}.${String(plan.method)}`; }).sort(); await write(io, "stdout", rows.join("\n")); return 0; };
      case "events:list": return async (argv, io) => { exact(argv, 0); const queued = new Set((registry.classAttachments ?? []).filter((entry) => entry.definition === Queue.definition).map((entry) => entry.target)); const rows = registry.events.map((event) => `${event.alias ?? event.target.name}\t${event.target.name}\t${event.listeners.map((listener) => `${listener.target.name}:${queued.has(listener.target) ? "queued" : "direct"}`).join(",")}`).sort(); await write(io, "stdout", rows.join("\n")); return 0; };
      case "jobs:list": return async (argv, io) => { exact(argv, 0); const rows = registry.classes.filter((entry) => entry.kind === BUN_JOB_KIND).map((entry) => { const job = entry.data as BunJobDefinition; return `${job.id}\t${job.queue}\ttries=${job.tries}${job.timeout === undefined ? "" : `\ttimeout=${job.timeout}`}`; }).sort(); await write(io, "stdout", rows.join("\n")); return 0; };
      case "queue:failed": return async (argv, io) => { exact(argv, 0); const rows = (await this.queues.listFailed()).map((record) => `${record.envelope.id}\t${record.envelope.job}\t${record.envelope.queue}\t${record.reason}\t${record.failedAt}`).sort(); await write(io, "stdout", rows.join("\n")); return 0; };
      case "queue:retry": return async (argv, io) => { exact(argv, 1); const receipt = await this.queues.retryFailed(argv[0]!); await write(io, "stdout", `${receipt.id}\t${receipt.job}\t${receipt.queue}`); return 0; };
      case "queue:forget": return async (argv, io) => { exact(argv, 1); if (!await this.queues.forgetFailed(argv[0]!)) throw new Error(`Failed job "${argv[0]}" does not exist.`); await write(io, "stdout", argv[0]!); return 0; };
      case "schedule:list": return async (argv, io) => { exact(argv, 0); const rows = this.scheduler.definitions.map((entry) => `${entry.id}\t${entry.cron}\t${entry.timezone ?? this.scheduler.options.timezone}\t${entry.execution}\t${entry.target.name}\t${entry.overlap}`).sort(); await write(io, "stdout", rows.join("\n")); return 0; };
      case "schedule:run": return async (argv, io) => { exact(argv, 0); const count = await this.scheduler.runDue(); await write(io, "stdout", `Executed ${count} due schedule(s).`); return 0; };
      default: return undefined;
    }
  }
}

export const bunCommandArgumentResolver = defineParameterResolver({ id: "bun.command-argument", resolve({ context, parameter }) { return context.container.get(BUN_COMMAND_CONTEXT).arguments[(parameter.data as BunCommandArgumentDefinition).name]; } });
export const bunCommandOptionResolver = defineParameterResolver({ id: "bun.command-option", resolve({ context, parameter }) { return context.container.get(BUN_COMMAND_CONTEXT).options[(parameter.data as BunCommandOptionDefinition).name]; } });
export const bunCommandFlagResolver = defineParameterResolver({ id: "bun.command-flag", resolve({ context, parameter }) { return context.container.get(BUN_COMMAND_CONTEXT).options[(parameter.data as BunCommandFlagDefinition).name]; } });

export async function runBunCli(application: Application, registry: RuntimeRegistry, options: BunCliRunOptions = {}): Promise<number> {
  const io = options.io ?? DEFAULT_IO; let code = 1; let failure: unknown;
  try { await application.withRuntimeRegistry(registry).start(); code = await application.rootContainer.get(BUN_COMMAND_RUNTIME).run(options.argv ?? Bun.argv.slice(2), io); }
  catch (error) { failure = error; }
  try { await application.stop(); } catch (error) { failure = failure === undefined ? error : new AggregateError([failure, error], "Command startup/execution and cleanup failed."); }
  if (failure !== undefined) { await write(io, "stderr", errorText(failure)); return 1; }
  return code;
}
