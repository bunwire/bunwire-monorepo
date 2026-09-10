import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const childFixture = fileURLToPath(new URL("./fixtures/form-request-child.ts", import.meta.url));

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
      if (!output.includes(marker)) reject(new Error(`Form Request child exited early (${code}, ${signal}).\n${output}`));
    });
  });
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error("Form Request child did not stop.")); }, 10_000);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0 && signal === null) resolve();
      else reject(new Error(`Form Request child exited with code ${code}, signal ${signal}.`));
    });
    child.once("error", reject);
  });
}

describe("Bun Milestone 6 — real Form Request HTTP process", () => {
  it("validates JSON and multipart requests, isolates scopes, and shuts down cleanly", async () => {
    const child = spawn("bun", [childFixture], { cwd: repositoryRoot, stdio: "pipe" });
    try {
      const ready = await waitForMarker(child, "BUNWIRE_FORM_REQUEST_READY");
      const match = ready.match(/BUNWIRE_FORM_REQUEST_READY (https?:\/\/\S+)/);
      expect(match).not.toBeNull();
      const origin = match![1]!.replace(/\/$/, "");

      const valid = await fetch(`${origin}/requests/route-id?id=query-id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "body-id", name: "valid" }),
      });
      expect(valid.status).toBe(200);
      await expect(valid.json()).resolves.toMatchObject({ id: "route-id", name: "valid" });

      const invalid = await fetch(`${origin}/requests/invalid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "bad" }),
      });
      expect(invalid.status).toBe(422);

      const form = new FormData();
      form.append("name", "valid");
      form.append("upload", new File(["hello"], "process.txt", { type: "text/plain" }));
      const multipart = await fetch(`${origin}/requests/file`, { method: "POST", body: form });
      expect(multipart.status).toBe(200);
      await expect(multipart.json()).resolves.toMatchObject({ id: "file", file: "process.txt" });

      const requestScope = async (id: string): Promise<{ id: string; scopeId: number }> => {
        const response = await fetch(`${origin}/requests/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "valid" }),
        });
        return response.json() as Promise<{ id: string; scopeId: number }>;
      };
      const [first, second] = await Promise.all([
        requestScope("one"),
        requestScope("two"),
      ]);
      expect(first.id).toBe("one");
      expect(second.id).toBe("two");
      expect(first.scopeId).not.toBe(second.scopeId);

      const exiting = waitForExit(child);
      const stopped = waitForMarker(child, "BUNWIRE_FORM_REQUEST_STOPPED");
      child.stdin.write("stop\n");
      await stopped;
      await exiting;
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
  }, 30_000);
});
