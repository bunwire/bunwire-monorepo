import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const childFixture = fileURLToPath(new URL("../milestone-03/fixtures/http-child.ts", import.meta.url));

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
        reject(new Error(`Middleware child exited early (${code}, ${signal}).\n${output}`));
      }
    });
  });
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Middleware child did not stop."));
    }, 10_000);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0 && signal === null) resolve();
      else reject(new Error(`Middleware child exited with code ${code}, signal ${signal}.`));
    });
    child.once("error", reject);
  });
}

describe("Bun Milestone 4 — real native HTTP middleware", () => {
  it("runs generated parameterized middleware and native short-circuiting", async () => {
    const child = spawn("bun", [childFixture], { cwd: repositoryRoot, stdio: "pipe" });
    try {
      const ready = await waitForMarker(child, "BUNWIRE_HTTP_READY");
      const origin = ready.match(/BUNWIRE_HTTP_READY (https?:\/\/\S+)/)![1]!.replace(/\/$/, "");

      const get = await fetch(`${origin}/api?query=ignored`);
      expect(get.status).toBe(200);
      expect(get.headers.get("x-bunwire-middleware")).toBe("example");
      expect(get.headers.get("x-bunwire-method")).toBe("GET");
      expect(get.headers.get("x-bunwire-path")).toBe("/api");

      const post = await fetch(`${origin}/api/echo/value`, { method: "POST" });
      expect(post.status).toBe(200);
      expect(post.headers.get("x-bunwire-method")).toBe("POST");
      expect(post.headers.get("x-bunwire-path")).toBe("/api/echo/value");

      const blocked = await fetch(`${origin}/api/blocked`);
      expect(blocked.status).toBe(403);
      expect(await blocked.text()).toBe("Blocked by example middleware");
      expect(blocked.headers.get("x-bunwire-middleware")).toBe("example");

      const exiting = waitForExit(child);
      const stopped = waitForMarker(child, "BUNWIRE_HTTP_STOPPED");
      child.stdin.write("stop\n");
      await stopped;
      await exiting;
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
  }, 30_000);
});
