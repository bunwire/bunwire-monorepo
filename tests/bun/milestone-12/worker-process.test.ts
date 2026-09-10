import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryQueueDriver, type QueueEnvelope, type QueueReservation } from "@bunwire/bun";
import { generateBunwireArtifacts } from "@bunwire/vite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const root = fileURLToPath(new URL("../../fixtures/bun-milestone-12-worker/", import.meta.url));
let generatedDirectory: string;
let registryPath: string;
beforeAll(async () => {
  generatedDirectory = await mkdtemp(path.join(root, ".generated-"));
  const artifacts = await generateBunwireArtifacts({ root, generatedModulePath: path.join(generatedDirectory, "registry.ts"),
    generatedClientModulePath: path.join(generatedDirectory, "client.ts"), generatedDeclarationsPath: path.join(generatedDirectory, "virtual.d.ts") });
  registryPath = artifacts.paths.registry;
});
afterAll(async () => { if (generatedDirectory) await rm(generatedDirectory, { recursive: true, force: true }); });

interface Notice { operation: string; id?: string; attempts?: number }
async function broker() {
  const driver = new MemoryQueueDriver(); driver.initialize({ execute: async () => {} });
  const notices: Notice[] = [];
  const server = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const data = JSON.parse(Buffer.concat(chunks).toString() || "{}") as { envelope: QueueEnvelope; reservation: QueueReservation; queue: string; duration: number; delay: number; id: string; attempts: number };
      const operation = request.url!.slice(1); let result: unknown = null;
      if (operation === "reserve") result = driver.reserve(data.queue, data.duration) ?? null;
      else if (operation === "push") driver.push(data.envelope);
      else if (operation === "renew") result = driver.renew(data.reservation, data.duration);
      else if (operation === "ack") driver.acknowledge(data.reservation);
      else if (operation === "release") driver.release(data.reservation, data.delay);
      else if (operation === "fail") driver.fail(data.reservation, "terminal");
      if (operation !== "reserve") notices.push({ operation, ...(data.reservation ? { id: data.reservation.envelope.id, attempts: data.reservation.envelope.attempts } : { id: data.id, attempts: data.attempts }) });
      response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(result));
    } catch (error) { response.writeHead(500); response.end(String(error)); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  return { driver, notices, origin: `http://127.0.0.1:${address.port}`, async close() {
    driver.close(); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  } };
}
function launch(origin: string) {
  const child = spawn("bun", [fileURLToPath(new URL("./fixtures/worker-child.ts", import.meta.url)), registryPath], {
    cwd: root, stdio: "pipe", env: { ...process.env, BUNWIRE_TEST_BROKER: origin },
  });
  let output = ""; child.stdout.on("data", (chunk) => { output += chunk.toString(); }); child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`Worker process timed out: ${output}`)); }, 15_000);
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("exit", (code, signal) => { clearTimeout(timeout); resolve({ code, signal }); });
  });
  void exited.catch(() => undefined);
  return { child, exited, async wait(marker: string) { await vi.waitFor(() => {
    if (!output.includes(marker) && (child.exitCode !== null || child.signalCode !== null)) throw new Error(`Worker exited before ${marker}: ${output}`);
    expect(output, output).toContain(marker);
  }, { timeout: 15_000, interval: 10 }); }, output: () => output };
}
async function cleanup(child: ChildProcessWithoutNullStreams, exited: Promise<unknown>): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  await exited;
}
function enqueue(driver: MemoryQueueDriver, id: string, mode: string) {
  driver.push({ version: 1, id, job: "process.worker-job", payload: JSON.stringify([mode]), serializer: { id: "bun.json", version: 1 }, queue: "default",
    attempts: 0, createdAt: Date.now(), availableAt: Date.now(), policy: { tries: 2, backoff: [20] } });
}

describe("generated worker in real Bun with a surviving test broker", () => {
  it("retries compiled jobs with Provider boot/DI and drains before a clean process exit", async () => {
    const queue = await broker(); enqueue(queue.driver, "retry", "retry"); const running = launch(queue.origin);
    try {
      await running.wait("WORKER_READY"); await vi.waitFor(() => expect(queue.notices).toContainEqual({ operation: "ack", id: "retry", attempts: 2 }), { timeout: 15_000 });
      running.child.stdin.write("STOP\n"); expect(await running.exited).toEqual({ code: 0, signal: null });
      expect(queue.notices).toContainEqual({ operation: "release", id: "retry", attempts: 1 });
      expect(queue.notices.findIndex((notice) => notice.operation === "disposed" && notice.attempts === 2)).toBeLessThan(queue.notices.findIndex((notice) => notice.operation === "ack"));
      expect(running.output()).toContain("WORKER_STOPPED");
    } finally { await cleanup(running.child, running.exited); await queue.close(); }
  });
  it.each(["SIGINT", "SIGTERM"] as const)("finishes and acknowledges active work before native %s termination", async (signal) => {
    const queue = await broker(); enqueue(queue.driver, "graceful", "hold"); const running = launch(queue.origin);
    try {
      await running.wait("ATTEMPT graceful 1"); running.child.stdin.write(`${signal}\n`);
      const exit = await running.exited;
      expect(queue.notices.some((notice) => notice.operation === "renew")).toBe(true);
      expect(queue.notices).toContainEqual({ operation: "ack", id: "graceful", attempts: 1 });
      expect(queue.notices.at(-1)?.operation).toBe("close");
      if (process.platform === "win32") expect(exit).toEqual({ code: 1, signal: null });
      else expect(exit.signal === signal || exit.code === 128 + (signal === "SIGINT" ? 2 : 15)).toBe(true);
    } finally { await cleanup(running.child, running.exited); await queue.close(); }
  });
  it("recovers an unacknowledged lease after abrupt worker death without rebuilding or scanning sources", async () => {
    const queue = await broker(); enqueue(queue.driver, "recover", "hold"); const first = launch(queue.origin); let second: ReturnType<typeof launch> | undefined;
    try {
      await first.wait("ATTEMPT recover 1"); first.child.kill("SIGKILL"); await first.exited;
      expect(queue.notices.some((notice) => notice.operation === "ack")).toBe(false);
      second = launch(queue.origin); await second.wait("ATTEMPT recover 2");
      await vi.waitFor(() => expect(queue.notices).toContainEqual({ operation: "ack", id: "recover", attempts: 2 }), { timeout: 15_000 });
      second.child.stdin.write("STOP\n"); expect(await second.exited).toEqual({ code: 0, signal: null });
    } finally { await cleanup(first.child, first.exited); if (second) await cleanup(second.child, second.exited); await queue.close(); }
  });
});
