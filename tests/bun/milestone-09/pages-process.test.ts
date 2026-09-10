import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/page-child.ts", import.meta.url));

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

describe("Bun Milestone 9 — real page process", () => {
  it("serves initial HTML, navigation JSON, version reloads, and generated production assets", async () => {
    const child = spawn("bun", [fixture], { cwd: path.join(repositoryRoot, "examples/bun-app"), stdio: "pipe" });
    try {
      const ready = await marker(child, "BUNWIRE_PAGES_READY");
      const origin = ready.match(/BUNWIRE_PAGES_READY (https?:\/\/\S+)/)![1]!.replace(/\/$/, "");
      const initial = await fetch(`${origin}/api/page`);
      expect(initial.status).toBe(200);
      expect(initial.headers.get("X-Bunwire-Page")).toBe("true");
      const html = await initial.text();
      expect(html).toContain('id="bunwire-page"');
      const entry = html.match(/<script type="module" src="([^"]+)"><\/script><\/body>/)![1]!;
      const asset = await fetch(new URL(entry, origin));
      expect(asset.status).toBe(200);

      const navigation = await fetch(`${origin}/api/page/dashboard`, { headers: { "X-Bunwire-Page": "true" } });
      expect(navigation.status).toBe(200);
      const payload = await navigation.json() as { component: string; version: string };
      expect(payload.component).toBe("Dashboard");
      expect(payload.version).toMatch(/^[a-f0-9]{64}$/);

      const stale = await fetch(`${origin}/api/page`, { headers: { "X-Bunwire-Page": "true", "X-Bunwire-Version": "stale" } });
      expect(stale.status).toBe(409);
      expect(stale.headers.get("X-Bunwire-Location")).toBe(`${origin}/api/page`);

      const invalid = await fetch(`${origin}/api/page-form`, {
        method: "POST", redirect: "manual",
        headers: { "Content-Type": "application/json", "X-Bunwire-Page": "true", Referer: `${origin}/api/page` },
        body: JSON.stringify({ name: "x", secret: "must-not-flash" }),
      });
      expect(invalid.status).toBe(303);
      expect(invalid.headers.get("Location")).toBe("/api/page");
      const cookie = invalid.headers.get("Set-Cookie")!.split(";")[0]!;
      const afterValidation = await fetch(`${origin}/api/page`, { headers: { Cookie: cookie, "X-Bunwire-Page": "true" } });
      const validationPage = await afterValidation.json() as { props: Record<string, unknown> };
      expect(validationPage.props).toMatchObject({ errors: { name: [expect.any(String)] }, old: { name: "x" } });
      expect(JSON.stringify(validationPage.props)).not.toContain("must-not-flash");

      const stopped = marker(child, "BUNWIRE_PAGES_STOPPED");
      child.stdin.write("stop\n");
      await stopped;
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill(); }
  }, 30_000);
});
