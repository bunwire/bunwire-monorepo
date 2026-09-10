import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const childFixture = fileURLToPath(new URL("./fixtures/http-pipeline-child.ts", import.meta.url));

function waitForMarker(child: ChildProcessWithoutNullStreams, marker: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out waiting for ${marker}.\n${output}`));
    }, 15_000);
    const receive = (chunk: Buffer): void => {
      output += chunk.toString();
      if (!output.includes(marker)) return;
      clearTimeout(timeout);
      child.stdout.off("data", receive);
      resolve(output);
    };
    child.stdout.on("data", receive);
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (!output.includes(marker)) {
        clearTimeout(timeout);
        reject(new Error(`Pipeline child exited early (${code}, ${signal}).\n${output}`));
      }
    });
  });
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Pipeline child did not stop."));
    }, 10_000);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0 && signal === null) resolve();
      else reject(new Error(`Pipeline child exited with code ${code}, signal ${signal}.`));
    });
    child.once("error", reject);
  });
}

describe("Bun Milestone 5 — real HTTP exception pipeline", () => {
  it("normalizes responses, survives request errors, and shuts down cleanly", async () => {
    const child = spawn("bun", [childFixture], { cwd: repositoryRoot, stdio: "pipe" });
    try {
      const ready = await waitForMarker(child, "BUNWIRE_PIPELINE_READY");
      const match = ready.match(/BUNWIRE_PIPELINE_READY (https?:\/\/\S+)/);
      expect(match).not.toBeNull();
      const origin = match![1]!.replace(/\/$/, "");

      const json = await fetch(`${origin}/pipeline/json`);
      expect(json.status).toBe(200);
      await expect(json.json()).resolves.toEqual({ ok: true, source: "pipeline" });

      const empty = await fetch(`${origin}/pipeline/void`);
      expect(empty.status).toBe(204);

      const moved = await fetch(`${origin}/pipeline/redirect`, { redirect: "manual" });
      expect(moved.status).toBe(303);
      expect(moved.headers.get("location")).toBe("/pipeline/json");

      const known = await fetch(`${origin}/pipeline/known`);
      expect(known.status).toBe(418);
      await expect(known.text()).resolves.toBe("Teapot");

      const failure = await fetch(`${origin}/pipeline/failure`);
      expect(failure.status).toBe(500);
      await expect(failure.text()).resolves.toBe("Internal Server Error");

      const stillRunning = await fetch(`${origin}/pipeline/json`);
      expect(stillRunning.status).toBe(200);

      const exiting = waitForExit(child);
      const stopped = waitForMarker(child, "BUNWIRE_PIPELINE_STOPPED");
      child.stdin.write("stop\n");
      await stopped;
      await exiting;
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
  }, 30_000);
});
