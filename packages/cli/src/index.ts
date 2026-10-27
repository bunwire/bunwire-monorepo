import path from "node:path";
import {
  BUNWIRE_INSPECTION_COMMANDS,
  BunwireCompilerError,
  generateBunwireArtifacts,
  inspectBunwireApplication,
  type BunwireInspectionItem,
} from "@bunwire/vite/compiler";
import { watchBunwireProject } from "./watch.js";

export interface BunwireCliIO {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

export interface BunwireCliOptions {
  readonly cwd?: string;
  readonly io?: BunwireCliIO;
  readonly signal?: AbortSignal;
}

const commands = Object.freeze([
  ["help", "Show command help."],
  ["list", "List available commands."],
  ["generate", "Generate physical Bunwire artifacts for one project."],
  ["watch", "Regenerate physical artifacts when project inputs change."],
  ...BUNWIRE_INSPECTION_COMMANDS.map((command) => [command, `Inspect compiled ${command.replace(":list", "")} definitions.`] as const),
] as const);

const defaultIO: BunwireCliIO = {
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`),
};

function commandList(): string {
  return ["Available Bunwire commands:", ...commands.map(([name, description]) => `  ${name.padEnd(10)} ${description}`)].join("\n");
}

function help(command?: string): string {
  if (command && BUNWIRE_INSPECTION_COMMANDS.some((entry) => entry === command)) {
    return `Usage: bunwire ${command} [--root path] [--json]\nInspect compiled project definitions without starting the application.`;
  }
  if (command === "generate") return "Usage: bunwire generate [--root path]\nGenerate physical Bunwire artifacts for one configured project.";
  if (command === "watch") return "Usage: bunwire watch [--root path]\nRegenerate physical Bunwire artifacts when project inputs change.";
  if (command === "list") return "Usage: bunwire list\nList available commands.";
  if (command === "help") return "Usage: bunwire help [command]\nShow general or per-command help.";
  return `Usage: bunwire <command> [options]\n\n${commandList()}\n\nOptions:\n  --root path  Select one project root (default: current working directory).\n  --json       Emit a JSON envelope for inspection commands.`;
}

function humanInspection(items: readonly BunwireInspectionItem[]): string {
  const rows = ["NAME\tKIND\tDETAILS\tRELATED\tSOURCE"];
  for (const entry of items) {
    const values = Object.entries(entry.details).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(" ");
    rows.push(`${entry.name}\t${entry.kindId}\t${values}\t${entry.related.join(",")}\t${entry.location ? `${entry.location.file}:${entry.location.line}` : "-"}`);
  }
  return rows.join("\n");
}

function diagnostic(error: unknown): string {
  if (error instanceof BunwireCompilerError) {
    const location = error.location
      ? `${error.location.filePath}:${error.location.line}:${error.location.column}`
      : error.filePath;
    const related = error.related.map((item) => `  ${item.label}: ${item.location.filePath}:${item.location.line}:${item.location.column}`);
    return [`${error.code}${location ? ` (${location})` : ""}: ${error.message}`, ...related].join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}

/** Run the project tooling in a Node process without importing an application. */
export async function runBunwireCli(argv: readonly string[], options: BunwireCliOptions = {}): Promise<number> {
  const io = options.io ?? defaultIO;
  const cwd = options.cwd ?? process.cwd();
  let root: string | undefined;
  let json = false;
  const positionals: string[] = [];
  try {
    for (let index = 0; index < argv.length; index++) {
      const arg = argv[index]!;
      if (arg === "--root") {
        if (root !== undefined) throw new Error("--root may be supplied only once.");
        const value = argv[++index];
        if (!value || value.startsWith("--")) throw new Error("--root requires a path.");
        root = value;
      } else if (arg.startsWith("--root=")) {
        if (root !== undefined) throw new Error("--root may be supplied only once.");
        root = arg.slice("--root=".length);
        if (!root) throw new Error("--root requires a path.");
      } else if (arg === "--json") {
        if (json) throw new Error("--json may be supplied only once.");
        json = true;
      } else if (arg.startsWith("-")) {
        throw new Error(`Unknown option "${arg}".`);
      } else {
        positionals.push(arg);
      }
    }
    const [command, ...args] = positionals;
    if (json && !BUNWIRE_INSPECTION_COMMANDS.some((entry) => entry === command)) {
      throw new Error("--json is available only for inspection commands.");
    }
    if (command === undefined || command === "help") {
      if (args.length > 1) throw new Error("help accepts at most one command name.");
      if (args[0] && !commands.some(([name]) => name === args[0])) throw new Error(`Unknown command "${args[0]}".`);
      io.stdout(help(args[0]));
      return 0;
    }
    if (command === "list") {
      if (args.length) throw new Error("list does not accept positional arguments.");
      io.stdout(commandList());
      return 0;
    }
    if (command === "generate") {
      if (args.length) throw new Error("generate does not accept positional arguments.");
      const result = await generateBunwireArtifacts({ root: path.resolve(cwd, root ?? ".") });
      io.stdout(`Generated Bunwire artifacts in ${path.dirname(result.paths.registry)} (${result.changedPaths.length} changed).`);
      return 0;
    }
    if (command === "watch") {
      if (args.length) throw new Error("watch does not accept positional arguments.");
      return await watchBunwireProject(path.resolve(cwd, root ?? "."), io, options.signal, diagnostic);
    }
    if (BUNWIRE_INSPECTION_COMMANDS.some((entry) => entry === command)) {
      if (args.length) throw new Error(`${command} does not accept positional arguments.`);
      const inspection = await inspectBunwireApplication({ root: path.resolve(cwd, root ?? ".") });
      const selected = inspection.items[command as keyof typeof inspection.items];
      io.stdout(json ? JSON.stringify({ schemaVersion: 1, command, root: inspection.root, items: selected }) : humanInspection(selected));
      return 0;
    }
    throw new Error(`Unknown command "${command}". Run "bunwire help" to list commands.`);
  } catch (error) {
    io.stderr(diagnostic(error));
    return 1;
  }
}
