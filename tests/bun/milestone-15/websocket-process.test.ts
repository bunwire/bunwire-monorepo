import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateBunwireArtifacts } from "@bunwire/vite";

const root = fileURLToPath(new URL("../../fixtures/bun-milestone-15/", import.meta.url));
const childFile = fileURLToPath(new URL("./fixtures/websocket-child.ts", import.meta.url));

async function waitUntil(check: () => boolean, describeState: () => string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${describeState()}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function connect(url: string): { socket: WebSocket; messages: string[]; opened: Promise<void>; closed: Promise<CloseEvent> } {
  const socket = new WebSocket(url);
  const messages: string[] = [];
  socket.addEventListener("message", (event) => messages.push(String(event.data)));
  const opened = new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error(`WebSocket handshake failed for ${url}`)), { once: true });
  });
  const closed = new Promise<CloseEvent>((resolve) => socket.addEventListener("close", (event) => resolve(event), { once: true }));
  return { socket, messages, opened, closed };
}

describe("Bun Milestone 15 — real WebSocket server", () => {
  it("authorizes upgrades, isolates connections/messages, publishes, and closes gracefully", async () => {
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
      await waitUntil(() => output.includes("BUNWIRE_WEBSOCKET_READY") || current.exitCode !== null,
        () => output, 15000);
      const origin = output.match(/BUNWIRE_WEBSOCKET_READY (https?:\/\/\S+)/)?.[1];
      if (!origin) throw new Error(`Server did not start:\n${output}`);
      const endpoint = origin.replace(/^http/, "ws").replace(/\/$/, "") + "/chat/room1";
      expect((await fetch(endpoint.replace(/^ws/, "http"))).status).toBe(401);
      expect((await fetch(`${origin}chat/restricted?token=accepted`)).status).toBe(403);
      const httpPost = await fetch(endpoint.replace(/^ws/, "http"), { method: "POST" });
      expect(httpPost.status).toBe(200);
      expect(await httpPost.json()).toEqual({ http: true });

      const denied = connect(endpoint);
      await expect(denied.opened).rejects.toThrow(/handshake failed/);

      const first = connect(`${endpoint}?token=accepted`);
      const second = connect(`${endpoint}?token=accepted`);
      await Promise.all([first.opened, second.opened]);
      await waitUntil(() => first.messages.length >= 1 && second.messages.length >= 1, () => JSON.stringify([first.messages, second.messages]));
      const firstOpen = JSON.parse(first.messages[0]!);
      const secondOpen = JSON.parse(second.messages[0]!);
      expect(firstOpen).toMatchObject({ event: "open", identity: { userId: "user-1" }, dependency: "injected" });
      expect(firstOpen.connection).not.toBe(secondOpen.connection);

      first.socket.send("first");
      first.socket.send("second");
      second.socket.send("other");
      await waitUntil(() => first.messages.length >= 3 && second.messages.length >= 2, () => JSON.stringify([first.messages, second.messages]));
      const firstReplies = first.messages.slice(1, 3).map((message) => JSON.parse(message));
      expect(firstReplies.map((reply) => reply.count)).toEqual([1, 2]);
      expect(firstReplies[0]!.messageScope).not.toBe(firstReplies[1]!.messageScope);
      await waitUntil(() => output.includes(`MESSAGE_DISPOSED ${firstReplies[0]!.messageScope}`)
        && output.includes(`MESSAGE_DISPOSED ${firstReplies[1]!.messageScope}`), () => output);
      expect(firstReplies[0]!.connection).toBe(firstOpen.connection);
      expect(JSON.parse(second.messages[1]!).count).toBe(1);

      first.socket.send("publish:hello-room");
      await waitUntil(() => second.messages.includes("hello-room"), () => JSON.stringify(second.messages));

      first.socket.send("hang");
      await waitUntil(() => output.includes("HANG_STARTED"), () => output);

      current.stdin.write("stop\n");
      await waitUntil(() => output.includes("BUNWIRE_WEBSOCKET_STOPPED") || current.exitCode !== null, () => output, 10000);
      expect(output).toContain("BUNWIRE_WEBSOCKET_STOPPED");
      expect(output).toContain("SOCKET_CLOSED");
      expect((await first.closed).code).toBe(1001);
      expect((await second.closed).code).toBe(1001);
      await waitUntil(() => current.exitCode !== null, () => output, 5000);
      expect(current.exitCode).toBe(0);
    } finally {
      if (child && child.exitCode === null) child.kill();
      await rm(directory, { recursive: true, force: true });
    }
  }, 45000);
});
