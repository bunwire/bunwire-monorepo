import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/security-child.ts", import.meta.url));

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

function cookie(response: Response): string {
  return response.headers.get("set-cookie")!.split(";", 1)[0]!;
}

describe("Bun Milestone 8 — real security process", () => {
  it("completes session authentication, policy authorization, logout, and graceful stop", async () => {
    const child = spawn("bun", [fixture], { cwd: root, stdio: "pipe" });
    try {
      const ready = await marker(child, "BUNWIRE_SECURITY_READY");
      const origin = ready.match(/BUNWIRE_SECURITY_READY (https?:\/\/\S+)/)![1]!.replace(/\/$/, "");
      expect((await fetch(`${origin}/account`)).status).toBe(401);

      const login = await fetch(`${origin}/login`);
      expect(await login.json()).toEqual({ authenticated: true });
      let session = cookie(login);

      const account = await fetch(`${origin}/account`, { headers: { Cookie: session } });
      expect(await account.json()).toEqual({ id: "user-1" });
      session = cookie(account);

      const allowed = await fetch(`${origin}/posts/owned`, { headers: { Cookie: session } });
      expect(await allowed.json()).toEqual({ post: "owned" });
      const denied = await fetch(`${origin}/posts/other`, { headers: { Cookie: session } });
      expect(denied.status).toBe(403);

      const logout = await fetch(`${origin}/logout`, { headers: { Cookie: session } });
      expect(await logout.json()).toEqual({ guest: true });
      session = cookie(logout);
      expect((await fetch(`${origin}/account`, { headers: { Cookie: session } })).status).toBe(401);

      const stopped = marker(child, "BUNWIRE_SECURITY_STOPPED");
      child.stdin.write("stop\n");
      await stopped;
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
  }, 30_000);
});
