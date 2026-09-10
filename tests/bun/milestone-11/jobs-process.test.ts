import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateBunwireArtifacts } from "@bunwire/vite";
import { describe, expect, it } from "vitest";
const root = fileURLToPath(new URL("../../fixtures/bun-milestone-11/", import.meta.url));
describe("generated jobs in real Bun", () => {
  it("runs payload-only generated jobs with constructor DI, Provider boot and isolated scopes, then exits cleanly", async () => {
    const directory = await mkdtemp(path.join(root, ".generated-"));
    try {
      const generated = await generateBunwireArtifacts({ root, generatedModulePath: path.join(directory, "registry.ts"),
        generatedClientModulePath: path.join(directory, "client.ts"), generatedDeclarationsPath: path.join(directory, "virtual.d.ts") });
      const output = await new Promise<string>((resolve, reject) => {
        const child = spawn("bun", [fileURLToPath(new URL("./fixtures/job-child.ts", import.meta.url)), generated.paths.registry], { cwd: root, stdio: "pipe" });
        let output = "";
        const timeout = setTimeout(() => { child.kill(); reject(new Error(`Bun job process timed out: ${output}`)); }, 15000);
        child.stdout.on("data", (chunk) => { output += chunk.toString(); }); child.stderr.on("data", (chunk) => { output += chunk.toString(); });
        child.on("error", (error) => { clearTimeout(timeout); reject(error); });
        child.on("exit", (code) => { clearTimeout(timeout); code === 0 ? resolve(output) : reject(new Error(`Bun job process exited ${code}: ${output}`)); });
      });
      expect(output).toContain("JOBS_OK stopped");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
