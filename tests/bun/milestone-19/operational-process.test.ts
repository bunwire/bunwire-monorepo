import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const childFile = fileURLToPath(new URL("./fixtures/operational-child.ts", import.meta.url));

async function waitUntil(check: () => boolean, details: () => string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${details()}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("Bun Milestone 19 — real native server", () => {
  it("serves health and switches maintenance on the same listening server", async () => {
    const child: ChildProcessWithoutNullStreams = spawn("bun", [childFile], { stdio: "pipe" });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    try {
      await waitUntil(() => output.includes("BUNWIRE_OPERATIONAL_READY") || child.exitCode !== null, () => output);
      const origin = output.match(/BUNWIRE_OPERATIONAL_READY (https?:\/\/\S+)/)?.[1];
      if (!origin) throw new Error(`Bun server did not start:\n${output}`);
      const url = (path: string) => new URL(path, origin);
      expect((await fetch(url("/health/live"))).status).toBe(200);
      expect((await fetch(url("/health/ready"))).status).toBe(200);
      const head = await fetch(url("/health/ready"), { method: "HEAD" });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
      expect((await fetch(url("/native/hello"))).status).toBe(200);
      expect((await fetch(url("/health/live"), { method: "POST" })).status).toBe(405);
      child.stdin.write("enable\n");
      await waitUntil(() => output.includes("BUNWIRE_MAINTENANCE_ON"), () => output);
      const blocked = await fetch(url("/native/hello"));
      expect(blocked.status).toBe(503);
      expect(blocked.headers.get("Retry-After")).toBe("12");
      expect((await fetch(url("/missing"))).status).toBe(503);
      expect((await fetch(url("/health/live"))).status).toBe(200);
      expect((await fetch(url("/health/ready"))).status).toBe(503);
      expect((await fetch(url("/native/hello"), { headers: { "X-Operator-Key": "valid" } })).status).toBe(200);
      child.stdin.write("disable\n");
      await waitUntil(() => output.includes("BUNWIRE_MAINTENANCE_OFF"), () => output);
      expect((await fetch(url("/native/hello"))).status).toBe(200);
      child.stdin.write("stop\n");
      await waitUntil(() => output.includes("BUNWIRE_OPERATIONAL_STOPPED") || child.exitCode !== null, () => output);
      expect(output).toContain("BUNWIRE_OPERATIONAL_STOPPED");
    } finally {
      if (child.exitCode === null) child.kill();
    }
  });
});
