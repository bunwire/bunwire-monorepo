import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const childFixture = fileURLToPath(new URL("./fixtures/http-child.ts", import.meta.url));

function waitForMarker(
  child: ChildProcessWithoutNullStreams,
  marker: string,
): Promise<string> {
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
        reject(new Error(`HTTP child exited early (${code}, ${signal}).\n${output}`));
      }
    });
  });
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("HTTP child did not stop."));
    }, 10_000);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0 && signal === null) resolve();
      else reject(new Error(`HTTP child exited with code ${code}, signal ${signal}.`));
    });
    child.once("error", reject);
  });
}

describe("Bun Milestone 3 — real native HTTP process", () => {
  it("serves generated routes and shuts the native server down gracefully", async () => {
    const child = spawn("bun", [childFixture], { cwd: repositoryRoot, stdio: "pipe" });
    try {
      const ready = await waitForMarker(child, "BUNWIRE_HTTP_READY");
      const match = ready.match(/BUNWIRE_HTTP_READY (https?:\/\/\S+)/);
      expect(match).not.toBeNull();
      const origin = match![1]!.replace(/\/$/, "");

      const index = await fetch(`${origin}/api`);
      expect(index.status).toBe(200);
      await expect(index.json()).resolves.toEqual({ method: "GET", name: "bunwire" });

      const [first, second] = await Promise.all([
        fetch(`${origin}/api/echo/one`, { method: "POST" }),
        fetch(`${origin}/api/echo/two`, { method: "POST" }),
      ]);
      const firstBody = await first.json() as Record<string, unknown>;
      const secondBody = await second.json() as Record<string, unknown>;
      expect(firstBody).toMatchObject({ id: "one", method: "POST", url: `${origin}/api/echo/one` });
      expect(secondBody).toMatchObject({ id: "two", method: "POST" });
      expect(firstBody.scopeId).not.toBe(secondBody.scopeId);

      const notAllowed = await fetch(`${origin}/api`, { method: "POST" });
      expect(notAllowed.status).toBe(405);
      expect(notAllowed.headers.get("Allow")).toBe("GET");
      await expect(notAllowed.text()).resolves.toBe("Method Not Allowed");

      const missing = await fetch(`${origin}/missing`);
      expect(missing.status).toBe(404);
      await expect(missing.text()).resolves.toBe("Not Found");

      for (const path of ["/test/failure", "/test/unsupported"]) {
        const response = await fetch(`${origin}${path}`);
        expect(response.status).toBe(500);
        await expect(response.text()).resolves.toBe("Internal Server Error");
      }

      const exiting = waitForExit(child);
      const stopped = waitForMarker(child, "BUNWIRE_HTTP_STOPPED");
      child.stdin.write("stop\n");
      await stopped;
      await exiting;
      await expect(fetch(`${origin}/api`)).rejects.toThrow();
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
  }, 30_000);
});
