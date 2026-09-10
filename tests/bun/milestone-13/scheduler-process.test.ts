import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const entry = fileURLToPath(new URL("../../../examples/bun-app/scheduler/main.ts", import.meta.url));
const signalEntry = fileURLToPath(new URL("./fixtures/scheduler-child.ts", import.meta.url));

function launch(arguments_: readonly string[] = [], environment: Readonly<Record<string, string>> = {}, file = entry) {
  const child = spawn("bun", [file, ...arguments_], { cwd: root, stdio: "pipe", env: { ...process.env, ...environment } });
  let output = ""; child.stdout.on("data", (chunk) => { output += chunk.toString(); }); child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`Scheduler process timed out: ${output}`)); }, 15_000);
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("exit", (code, signal) => { clearTimeout(timeout); resolve({ code, signal }); });
  });
  void exited.catch(() => undefined);
  return { child, exited, output: () => output, async wait(marker: string) { await vi.waitFor(() => expect(output, output).toContain(marker), { timeout: 15_000, interval: 10 }); } };
}

async function cleanup(child: ChildProcessWithoutNullStreams, exited: Promise<unknown>): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  await exited.catch(() => undefined);
}

describe("generated scheduler example in real Bun", () => {
  it("runs a direct task and centrally scheduled job, then stops cleanly", async () => {
    const running = launch(["--demo"]);
    try {
      expect(await running.exited).toEqual({ code: 0, signal: null });
      expect(running.output()).toContain("TASK cleanup scheduledAt=");
      expect(running.output()).toContain("JOB daily attempt=1");
      expect(running.output()).toContain("SCHEDULER_STOPPED");
    } finally { await cleanup(running.child, running.exited); }
  });

  it("settles scheduler cleanup before native SIGTERM termination", async () => {
    const running = launch([], { BUNWIRE_SCHEDULER_HOLD: "true" }, signalEntry);
    try {
      await running.wait("TASK_STARTED"); running.child.stdin.write("SIGTERM\n"); const exit = await running.exited;
      expect(running.output()).toContain("TASK cleanup scheduledAt=");
      if (process.platform === "win32") expect(exit.signal === "SIGTERM" || exit.code === 1).toBe(true);
      else expect(exit.signal === "SIGTERM" || exit.code === 143).toBe(true);
    } finally { await cleanup(running.child, running.exited); }
  });
});
