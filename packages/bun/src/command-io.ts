import { BunCommandError, BunCommandUsageError, type BunCommandExecutionIO, type BunCommandIO } from "./commands.js";

function singleLine(value: string): string {
  return value.replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t").replace(/\x1b/g, "\\x1b");
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new BunCommandError(`${label} must be a non-empty string.`);
  return singleLine(value);
}

export function defaultBunCommandIO(): BunCommandIO {
  const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true && !process.env.CI;
  return Object.freeze({
    stdout(line: string): void { console.log(line); },
    stderr(line: string): void { console.error(line); },
    interactive,
    ...(interactive ? { async input(message: string, signal: AbortSignal): Promise<string | undefined> {
      const { createInterface } = await import("node:readline/promises");
      const reader = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
      try { return await reader.question(`${message} `, { signal }); }
      catch (error) {
        if (signal.aborted || (error instanceof Error && error.name === "AbortError")) {
          throw new BunCommandUsageError("Prompt was cancelled.");
        }
        throw error;
      } finally { reader.close(); }
    } } : {}),
  });
}

export function createBunCommandExecutionIO(io: BunCommandIO, signal: AbortSignal): BunCommandExecutionIO {
  return Object.freeze({
    stdout: (line: string) => io.stdout(line),
    stderr: (line: string) => io.stderr(line),
    ...(io.input ? { input: io.input } : {}),
    ...(io.interactive === undefined ? {} : { interactive: io.interactive }),
    async table(columns: readonly string[], rows: readonly (readonly string[])[]): Promise<void> {
      if (!Array.isArray(columns) || columns.length === 0 || columns.some((column) => typeof column !== "string" || !column.trim())
        || !Array.isArray(rows) || rows.some((row) => !Array.isArray(row) || row.length !== columns.length || row.some((cell) => typeof cell !== "string"))) {
        throw new BunCommandError("Command table requires non-empty string columns and equally sized string rows.");
      }
      const matrix = [columns, ...rows].map((row) => row.map(singleLine));
      const widths = columns.map((_, index) => Math.max(...matrix.map((row) => row[index]!.length)));
      const render = (row: readonly string[]) => row.map((cell, index) => cell.padEnd(widths[index]!)).join(" | ").trimEnd();
      await io.stdout([render(matrix[0]!), widths.map((width) => "-".repeat(width)).join("-+-"), ...matrix.slice(1).map(render)].join("\n"));
    },
    async progress(label: string, current: number, total: number): Promise<void> {
      const value = text(label, "Progress label");
      if (!Number.isSafeInteger(current) || !Number.isSafeInteger(total) || total <= 0 || current < 0 || current > total) {
        throw new BunCommandError("Progress requires integer current/total values with 0 <= current <= total and total > 0.");
      }
      await io.stdout(`Progress: ${value} ${current}/${total} (${Math.floor(current * 100 / total)}%)`);
    },
    async status(kind: "success" | "warning" | "error", message: string): Promise<void> {
      if (kind !== "success" && kind !== "warning" && kind !== "error") throw new BunCommandError("Command status kind must be success, warning, or error.");
      const line = `${kind.toUpperCase()}: ${text(message, "Status message")}`;
      await (kind === "error" ? io.stderr(line) : io.stdout(line));
    },
    async prompt(options: { readonly message: string; readonly nonInteractiveValue?: string }): Promise<string> {
      if (!options || typeof options !== "object" || Array.isArray(options)) throw new BunCommandError("Prompt options must be an object.");
      const message = text(options.message, "Prompt message");
      if (options.nonInteractiveValue !== undefined && typeof options.nonInteractiveValue !== "string") {
        throw new BunCommandError("Prompt nonInteractiveValue must be a string.");
      }
      if (signal.aborted) throw new BunCommandUsageError("Prompt was cancelled.");
      if (io.interactive !== true || typeof io.input !== "function") {
        if (options.nonInteractiveValue !== undefined) return options.nonInteractiveValue;
        throw new BunCommandUsageError("Interactive input is unavailable; supply a nonInteractiveValue or run in a terminal.");
      }
      const value = await io.input(message, signal);
      if (signal.aborted || value === undefined) throw new BunCommandUsageError("Prompt was cancelled or reached end of input.");
      if (typeof value !== "string") throw new BunCommandError("Command input must return a string or undefined.");
      return value;
    },
  });
}
