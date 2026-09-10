import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function run(file: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", [file, ...args], { stdio: "pipe" }); let output = "";
    const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`Example timed out: ${output}`)); }, 15_000);
    child.stdout.on("data", (chunk) => { output += chunk.toString(); }); child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("exit", (code, signal) => { clearTimeout(timeout); code === 0 ? resolve(output) : reject(new Error(`Example exited (${code}, ${signal}): ${output}`)); });
  });
}

describe("generated Bun examples", () => {
  it("runs the worker entrypoint, retries a job and reconstructs its queued listener event before clean shutdown", async () => {
    const output = await run(fileURLToPath(new URL("../../../examples/bun-app/worker/main.ts", import.meta.url)), ["--demo"]);
    expect(output).toContain("JOB Bunwire attempt=2"); expect(output).toContain("LISTENER Bunwire scope=queue-job");
  });
  it("keeps direct and synchronous queued example audits separate using the generated sidecar", async () => {
    expect(await run(fileURLToPath(new URL("./fixtures/example-events.ts", import.meta.url)))).toContain("EXAMPLE_EVENTS_OK stopped");
  });
});
