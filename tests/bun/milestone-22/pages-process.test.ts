import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = fileURLToPath(new URL("../milestone-09/fixtures/page-child.ts", import.meta.url));

function marker(child: ChildProcessWithoutNullStreams, expected: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`Timed out waiting for ${expected}.\n${output}`)); }, 15_000);
    const receive = (chunk: Buffer): void => { output += chunk; if (output.includes(expected)) { clearTimeout(timeout); resolve(output); } };
    child.stdout.on("data", receive); child.stderr.on("data", receive);
    child.once("exit", (code, signal) => { if (!output.includes(expected)) reject(new Error(`Page child exited early (${code}, ${signal}).\n${output}`)); });
    child.once("error", reject);
  });
}

describe("Bun Milestone 22 — real page requests", () => {
  it("keeps old responses complete and runs deferred requests with fresh request state", async () => {
    const child = spawn("bun", [fixture], { cwd: path.join(repositoryRoot, "examples/bun-app"), stdio: "pipe" });
    try {
      const ready = await marker(child, "BUNWIRE_PAGES_READY");
      const origin = ready.match(/BUNWIRE_PAGES_READY (https?:\/\/\S+)/)![1]!.replace(/\/$/, "");
      const old = await fetch(`${origin}/api/advanced`, { headers: { "X-Bunwire-Page": "true", "X-Viewer": "old" } });
      expect((await old.json()).props).toMatchObject({ viewer: "old", delayed: "old" });
      const initial = await fetch(`${origin}/api/advanced`, { headers: {
        "X-Bunwire-Page": "true", "X-Bunwire-Page-Protocol": "2", "X-Viewer": "initial",
      } });
      expect(await initial.json()).toMatchObject({ props: { title: "Advanced", viewer: "initial" }, deferred: ["delayed"] });
      const deferred = await fetch(`${origin}/api/advanced`, { headers: {
        "X-Bunwire-Page": "true", "X-Bunwire-Page-Protocol": "2", "X-Viewer": "follow-up",
        "X-Bunwire-Partial-Component": "Dashboard", "X-Bunwire-Deferred-Props": '["delayed"]',
      } });
      expect(await deferred.json()).toMatchObject({ props: { delayed: "follow-up" }, partial: ["delayed"] });
      const scope = await fetch(`${origin}/api/advanced/scope`);
      expect(await scope.json()).toEqual({ state: "disposed" });
      const partial = await fetch(`${origin}/api/advanced`, { headers: {
        "X-Bunwire-Page": "true", "X-Bunwire-Page-Protocol": "2", "X-Viewer": "partial",
        "X-Bunwire-Partial-Component": "Dashboard", "X-Bunwire-Partial-Props": '["viewer"]',
      } });
      expect(await partial.json()).toMatchObject({ props: { viewer: "partial" }, partial: ["viewer"] });
      const stopped = marker(child, "BUNWIRE_PAGES_STOPPED");
      child.stdin.write("stop\n");
      await stopped;
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill(); }
  }, 30_000);
});
