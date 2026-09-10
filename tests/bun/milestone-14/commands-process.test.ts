import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url)); const entry = fileURLToPath(new URL("./fixtures/command-child.ts", import.meta.url));
function launch(args: readonly string[]) { const child = spawn("bun", [entry, ...args], { cwd: root, stdio: "pipe" }); let output = ""; child.stdout.on("data", (chunk) => { output += chunk.toString(); }); child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => { const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`Command process timed out: ${output}`)); }, 15_000); child.once("error", (error) => { clearTimeout(timeout); reject(error); }); child.once("exit", (code, signal) => { clearTimeout(timeout); resolve({ code, signal }); }); }); void exited.catch(() => undefined);
  return { child, exited, output: () => output, async wait(marker: string) { await vi.waitFor(() => expect(output, output).toContain(marker), { timeout: 15_000, interval: 10 }); } }; }
async function cleanup(child: ChildProcessWithoutNullStreams, exited: Promise<unknown>) { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await exited.catch(() => undefined); }

describe("Bun command process", () => {
  it("runs a managed command, returns its explicit code, and cleans up", async () => { const running = launch(["greet", "Ada", "--count=2"]); try { expect(await running.exited).toEqual({ code: 7, signal: null }); expect(running.output()).toContain("Hello Ada|Hello Ada"); } finally { await cleanup(running.child, running.exited); } });
  it("returns usage code 2 for invalid input", async () => { const running = launch(["greet"]); try { expect((await running.exited).code).toBe(2); expect(running.output()).toContain("Missing required argument"); } finally { await cleanup(running.child, running.exited); } });
  it("activates HTTP for serve and retains native signal shutdown", async () => { const running = launch(["serve"]); try { await running.wait("COMMAND_SERVER_READY"); const url = /COMMAND_SERVER_READY (\S+)/.exec(running.output())![1]!; expect(await (await fetch(new URL("/health", url))).text()).toBe("healthy"); running.child.kill("SIGTERM"); const result = await running.exited; if (process.platform === "win32") expect(result.signal === "SIGTERM" || result.code === 1).toBe(true); else expect(result.signal === "SIGTERM" || result.code === 143).toBe(true); } finally { await cleanup(running.child, running.exited); } });
});
