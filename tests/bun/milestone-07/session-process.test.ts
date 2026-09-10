import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/session-child.ts", import.meta.url));

function marker(child: ChildProcessWithoutNullStreams, expected: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`Timed out waiting for ${expected}.\n${output}`)); }, 15_000);
    const receive = (chunk: Buffer): void => {
      output += chunk.toString();
      if (!output.includes(expected)) return;
      clearTimeout(timeout); child.stdout.off("data", receive); resolve(output);
    };
    child.stdout.on("data", receive);
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.once("error", reject);
  });
}

describe("Bun Milestone 7 — real session/CSRF process", () => {
  it("restores state and enforces CSRF over native Bun HTTP", async () => {
    const child = spawn("bun", [fixture], { cwd: root, stdio: "pipe" });
    try {
      const ready = await marker(child, "BUNWIRE_SESSION_READY");
      const origin = ready.match(/BUNWIRE_SESSION_READY (https?:\/\/\S+)/)![1]!.replace(/\/$/, "");
      const initial = await fetch(`${origin}/state`);
      const body = await initial.json() as { count: number; token: string };
      const cookie = initial.headers.get("set-cookie")!.split(";", 1)[0]!;
      expect(body.count).toBe(0);

      const rejected = await fetch(`${origin}/state`, { method: "POST", headers: { Cookie: cookie } });
      expect(rejected.status).toBe(419);

      const accepted = await fetch(`${origin}/state`, {
        method: "POST", headers: { Cookie: cookie, "X-CSRF-TOKEN": body.token },
      });
      expect(await accepted.json()).toEqual({ count: 1 });
      const refreshed = accepted.headers.get("set-cookie")!.split(";", 1)[0]!;

      const restored = await fetch(`${origin}/state`, { headers: { Cookie: refreshed } });
      await expect(restored.json()).resolves.toMatchObject({ count: 1, flash: "saved" });

      const stopped = marker(child, "BUNWIRE_SESSION_STOPPED");
      child.stdin.write("stop\n");
      await stopped;
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
  }, 30_000);
});
