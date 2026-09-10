import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fixtureRoot, generateFixture } from "./fixture.js";

function marker(child: ChildProcessWithoutNullStreams, expected: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const cleanup = (): void => {
      clearTimeout(timeout);
      child.stdout.off("data", receive); child.stderr.off("data", receive);
      child.off("exit", exited); child.off("error", failed);
    };
    const failed = (error: Error): void => { cleanup(); reject(error); };
    const exited = (code: number | null, signal: NodeJS.Signals | null): void => {
      failed(new Error(`Event child exited before ${expected} (${code}, ${signal}).\n${output}`));
    };
    const receive = (chunk: Buffer): void => {
      output += chunk.toString();
      if (output.includes(expected)) { cleanup(); resolve(output); }
    };
    const timeout = setTimeout(() => failed(new Error(`Timed out waiting for ${expected}.\n${output}`)), 15_000);
    child.stdout.on("data", receive); child.stderr.on("data", receive);
    child.once("exit", exited); child.once("error", failed);
  });
}

describe("Bun Milestone 10 — native HTTP to Core events", () => {
  it("uses generated listeners, propagates failures, and exits after Core shutdown", async () => {
    const generated = await generateFixture();
    const child = spawn("bun", [fileURLToPath(new URL("./fixtures/event-child.ts", import.meta.url)), generated.paths.registry], {
      cwd: fixtureRoot, stdio: "pipe",
    });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    try {
      const ready = await marker(child, "BUNWIRE_EVENTS_READY");
      const origin = ready.match(/BUNWIRE_EVENTS_READY (https?:\/\/\S+)/)![1]!.replace(/\/$/, "");
      for (const id of ["one", "two"]) {
        const response = await fetch(`${origin}/events/run/${id}`);
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual([
          `${id}:first`, `${id}:nested`, `${id}:after-nested`, `${id}:second`,
        ]);
      }
      expect((await fetch(`${origin}/events/empty`)).status).toBe(204);
      const failure = await fetch(`${origin}/events/failure`);
      expect(failure.status).toBe(500);
      await expect(failure.text()).resolves.toBe("Internal Server Error");
      expect(await (await fetch(`${origin}/events/audit`)).json()).not.toContain("unreachable");
      expect((await fetch(`${origin}/events/handle`)).status).toBe(404);
      const stopped = marker(child, "BUNWIRE_EVENTS_STOPPED stopped");
      child.stdin.write("stop\n");
      await stopped;
      await expect(Promise.race([
        exited,
        new Promise<never>((_, reject) => {
          const timeout = setTimeout(() => reject(new Error("Event child did not exit")), 5_000);
          void exited.then(() => clearTimeout(timeout));
        }),
      ])).resolves.toEqual({ code: 0, signal: null });
      await expect(fetch(`${origin}/events/empty`)).rejects.toThrow();
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await exited;
      await generated.dispose();
    }
  });
});
