import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const childFixture = fileURLToPath(new URL("./fixtures/lifecycle-child.ts", import.meta.url));

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { force: true, recursive: true })
  )));
});

function waitForOutput(child: ChildProcessWithoutNullStreams, marker: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${marker}.\n${output}`)), 10_000);
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      if (output.includes(marker)) {
        clearTimeout(timeout);
        child.stdout.off("data", onData);
        resolve(output);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (!output.includes(marker)) {
        clearTimeout(timeout);
        reject(new Error(
          `Bun lifecycle child exited before ${marker} (code ${code}, signal ${signal}).\n${output}`,
        ));
      }
    });
  });
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<{
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Bun lifecycle child did not terminate."));
    }, 10_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

async function runChild(mode: "normal" | "signal"): Promise<{
  readonly child: ChildProcessWithoutNullStreams;
  readonly markerPath: string;
}> {
  const directory = await mkdtemp(path.join(tmpdir(), "bunwire-bun-m1-"));
  temporaryDirectories.push(directory);
  const markerPath = path.join(directory, "lifecycle.txt");
  const child = spawn(
    "bun",
    [childFixture, mode, markerPath],
    { cwd: repositoryRoot, stdio: "pipe" },
  );
  return { child, markerPath };
}

describe("Bun Milestone 1 — real Bun process lifecycle", () => {
  it("starts and stops a minimal application without hanging resources", async () => {
    const { child, markerPath } = await runChild("normal");
    const exiting = waitForExit(child);
    const output = await waitForOutput(child, "BUNWIRE_CHILD_STOPPED");
    const result = await exiting;

    expect(output).toContain("BUNWIRE_CHILD_STARTED");
    expect(result).toEqual({ code: 0, signal: null });
    await expect(readFile(markerPath, "utf8")).resolves.toBe(
      "started:running\nstopped:http\n",
    );
  });

  it.each(["SIGINT", "SIGTERM"] as const)(
    "performs adapter cleanup before native %s termination",
    async (signal) => {
      const { child, markerPath } = await runChild("signal");
      const exiting = waitForExit(child);
      await waitForOutput(child, "BUNWIRE_CHILD_STARTED");

      child.stdin.write(signal);
      const result = await exiting;
      const marker = await readFile(markerPath, "utf8");

      expect(marker).toBe("started:running\nstopped:http\n");
      if (process.platform === "win32") {
        expect(result).toEqual({ code: 1, signal: null });
      } else {
        expect(
          result.signal === signal
            || result.code === 128 + (signal === "SIGINT" ? 2 : 15),
        ).toBe(true);
      }
    },
  );
});
