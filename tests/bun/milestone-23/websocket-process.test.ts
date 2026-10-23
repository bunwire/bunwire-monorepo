import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateBunwireArtifacts } from "@bunwire/vite";

const root = fileURLToPath(new URL("../../fixtures/bun-milestone-23/", import.meta.url));
const childFile = fileURLToPath(new URL("./fixtures/websocket-child.ts", import.meta.url));

async function waitUntil(check: () => boolean, detail: () => string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${detail()}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function connect(url: string) {
  const socket = new WebSocket(url);
  const messages: string[] = [];
  socket.addEventListener("message", (event) => messages.push(String(event.data)));
  const opened = new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("WebSocket handshake failed")), { once: true });
  });
  const closed = new Promise<CloseEvent>((resolve) => socket.addEventListener("close", resolve, { once: true }));
  return { socket, messages, opened, closed };
}

describe("Bun Milestone 23 — real WebSocket conveniences", () => {
  it("isolates clients, authorizes channels, sends, validates and shuts down", async () => {
    const directory = await mkdtemp(path.join(root, ".generated-"));
    let child: ChildProcessWithoutNullStreams | undefined;
    try {
      const generated = await generateBunwireArtifacts({ root, generatedModulePath: path.join(directory, "registry.ts"),
        generatedClientModulePath: path.join(directory, "client.ts"), generatedDeclarationsPath: path.join(directory, "virtual.d.ts") });
      child = spawn("bun", [childFile, generated.paths.registry], { cwd: root, stdio: "pipe" });
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk.toString(); });
      child.stderr.on("data", (chunk) => { output += chunk.toString(); });
      const current = child;
      await waitUntil(() => output.includes("BUNWIRE_WEBSOCKET_READY") || current.exitCode !== null, () => output, 15000);
      const origin = output.match(/BUNWIRE_WEBSOCKET_READY (https?:\/\/\S+)/)?.[1];
      if (!origin) throw new Error(`Server did not start:\n${output}`);
      const endpoint = origin.replace(/^http/, "ws").replace(/\/$/, "") + "/chat";
      await expect(connect(endpoint).opened).rejects.toThrow(/handshake failed/);
      const alice = connect(`${endpoint}?token=alice`);
      const bob = connect(`${endpoint}?token=bob`);
      await Promise.all([alice.opened, bob.opened]);
      await waitUntil(() => alice.messages.length === 1 && bob.messages.length === 1, () => JSON.stringify([alice.messages, bob.messages]));
      const aliceOpen = JSON.parse(alice.messages[0]!);
      const bobOpen = JSON.parse(bob.messages[0]!);
      expect(aliceOpen.identity).toEqual({ userId: "alice" });
      expect(bobOpen.identity).toEqual({ userId: "bob" });
      expect(aliceOpen.scope).not.toBe(bobOpen.scope);

      alice.socket.send(JSON.stringify({ type: "join", payload: { channel: "user:alice" } }));
      bob.socket.send(JSON.stringify({ type: "join", payload: { channel: "user:alice" } }));
      await waitUntil(() => alice.messages.length >= 2 && bob.messages.length >= 2, () => JSON.stringify([alice.messages, bob.messages]));
      expect(JSON.parse(alice.messages[1]!)).toMatchObject({ event: "join", allowed: true });
      expect(JSON.parse(bob.messages[1]!)).toMatchObject({ event: "join", allowed: false });

      alice.socket.send(JSON.stringify({ type: "direct", payload: { id: bobOpen.id, text: "private" } }));
      await waitUntil(() => bob.messages.includes("private") && alice.messages.length >= 3, () => JSON.stringify([alice.messages, bob.messages]));
      expect(JSON.parse(alice.messages[2]!).delivery.status).toBe("sent");
      alice.socket.send(JSON.stringify({ type: "broadcast", payload: { channel: "user:alice", text: "room" } }));
      await waitUntil(() => alice.messages.length >= 4, () => JSON.stringify(alice.messages));
      expect(bob.messages).not.toContain("room");

      bob.socket.send("bad json");
      expect((await bob.closed).code).toBe(1007);
      await waitUntil(() => output.includes(`CLOSED ${bobOpen.id}`), () => output);
      alice.socket.send(JSON.stringify({ type: "direct", payload: { id: bobOpen.id, text: "late" } }));
      await waitUntil(() => alice.messages.length >= 5, () => JSON.stringify(alice.messages));
      expect(JSON.parse(alice.messages[4]!).delivery.status).toBe("missing");

      current.stdin.write("stop\n");
      await waitUntil(() => output.includes("BUNWIRE_WEBSOCKET_STOPPED") || current.exitCode !== null, () => output, 10000);
      expect(output).toContain("BUNWIRE_WEBSOCKET_STOPPED");
      expect((await alice.closed).code).toBe(1001);
      await waitUntil(() => current.exitCode !== null, () => output);
      expect(current.exitCode).toBe(0);
    } finally {
      if (child && child.exitCode === null) child.kill();
      await rm(directory, { recursive: true, force: true });
    }
  }, 45000);
});
