import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const entry = fileURLToPath(new URL("./fixtures/prompt-child.ts", import.meta.url));

async function run(fallback?: string): Promise<{ code: number | null; output: string }> {
  const child = spawn("bun", [entry], { cwd: root, stdio: "pipe", env: {
    ...process.env, CI: "1", ...(fallback === undefined ? {} : { BUNWIRE_PROMPT_FALLBACK: fallback }),
  } });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`Prompt process waited on stdin: ${output}`)); }, 10_000);
      child.once("error", (error) => { clearTimeout(timeout); reject(error); });
      child.once("exit", (value) => { clearTimeout(timeout); resolve(value); });
    });
    return { code, output };
  } finally { child.stdin.end(); if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }
}

describe("Bun Milestone 21 — noninteractive process", () => {
  it("exits with usage code without reading open stdin", async () => {
    const result = await run();
    expect(result.code).toBe(2);
    expect(result.output).toContain("Interactive input is unavailable");
  });
  it("uses an explicit fallback in CI", async () => {
    const result = await run("batch");
    expect(result.code).toBe(0);
    expect(result.output).toContain("SUCCESS: batch");
  });
});
