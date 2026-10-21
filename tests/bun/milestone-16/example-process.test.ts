import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BunTestClient } from "@bunwire/bun/testing";
import { BUN_PAGE_REQUEST_HEADER } from "@bunwire/bun";

const root = fileURLToPath(new URL("../../../examples/bun-app/", import.meta.url));
const execFileAsync = promisify(execFile);

async function waitUntil(check: () => boolean, details: () => string, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${details()}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("Bun milestone 16 integrated example", () => {
  it("executes the generated example command and exits cleanly", async () => {
    const result = await execFileAsync("bun", ["command/main.ts", "greet", "Ada", "--count=2", "--excited"], { cwd: root, timeout: 10_000 });
    expect(result.stdout.trim().split(/\r?\n/)).toEqual(["Hello, Ada!", "Hello, Ada!"]);
  });

  it("runs pages, session/CSRF/auth, validation, events, queued listeners, jobs, and a worker", async () => {
    const child: ChildProcessWithoutNullStreams = spawn("bun", ["src/main.ts"], {
      cwd: root, stdio: "pipe", env: { ...process.env, BUNWIRE_EXAMPLE_INTEGRATED: "1", BUNWIRE_EXAMPLE_PORT: "0" },
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    try {
      await waitUntil(() => output.includes("BUNWIRE_EXAMPLE_READY") || child.exitCode !== null, () => output);
      const origin = output.match(/BUNWIRE_EXAMPLE_READY (https?:\/\/\S+)/)?.[1];
      if (!origin) throw new Error(`Integrated example did not start:\n${output}`);
      const client = new BunTestClient(origin);
      const separateGuest = new BunTestClient(origin);
      const initial = await client.request("/api/page");
      expect(initial.status).toBe(200);
      expect(await initial.text()).toContain("bunwire-page");
      const navigation = await client.request("/api/page/dashboard", { headers: { [BUN_PAGE_REQUEST_HEADER]: "true" } });
      expect((await navigation.json() as { component: string }).component).toBe("Dashboard");
      const session = await (await client.request("/api/session")).json() as { csrfToken: string; count: number };
      expect(session.count).toBe(0);
      expect((await client.request("/api/session", { method: "POST" })).status).toBe(419);
      const updated = await client.csrfRequest("/api/session", session.csrfToken, { method: "POST" });
      expect(await updated.json()).toMatchObject({ count: 1 });
      expect((await (await client.request("/api/session")).json() as { count: number }).count).toBe(1);
      const unauthorized = await client.csrfRequest("/api/integrated/one", session.csrfToken, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "hello" }),
      });
      expect(unauthorized.status).toBe(401);
      expect((await (await client.request("/api/login")).json() as { authenticated: boolean }).authenticated).toBe(true);
      expect((await client.request("/api/account")).status).toBe(200);
      expect((await separateGuest.request("/api/account")).status).toBe(401);
      const refreshed = await (await client.request("/api/session")).json() as { csrfToken: string };
      const invalid = await client.csrfRequest("/api/integrated/one", refreshed.csrfToken, {
        method: "POST", headers: { "Content-Type": "application/json", [BUN_PAGE_REQUEST_HEADER]: "true", Referer: `${origin}api/page` },
        body: JSON.stringify({ message: "" }), redirect: "manual",
      });
      expect(invalid.status).toBe(303);
      const flashed = await client.request("/api/page", { headers: { [BUN_PAGE_REQUEST_HEADER]: "true" } });
      const page = await flashed.json() as { props: { errors?: object; old?: object } };
      expect(page.props.errors).toBeDefined();
      expect(page.props.old).toBeDefined();
      const accepted = await client.csrfRequest("/api/integrated/one", refreshed.csrfToken, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "hello" }),
      });
      expect(accepted.status).toBe(200);
      expect(await accepted.json()).toMatchObject({ id: "one", receipt: { job: "example.record-action" } });
      let status: { direct: number; queued: number; jobs: number } = { direct: 0, queued: 0, jobs: 0 };
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        status = await (await client.request("/api/integrated/status/one")).json() as typeof status;
        if (status.direct === 1 && status.queued === 1 && status.jobs === 1) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(status).toEqual({ direct: 1, queued: 1, jobs: 1 });
      const routeStarted = performance.now();
      for (let index = 0; index < 30; index++) expect((await client.request("/api")).status).toBe(200);
      const routeMs = performance.now() - routeStarted;
      const formStarted = performance.now();
      for (let index = 0; index < 20; index++) {
        const response = await client.request("/api/echo/perf", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "hello" }) });
        expect(response.status).toBe(200);
      }
      const formMs = performance.now() - formStarted;
      const eventStarted = performance.now();
      for (let index = 0; index < 20; index++) expect((await client.request("/api/events/perf", { method: "POST" })).status).toBe(200);
      const eventMs = performance.now() - eventStarted;
      let queuedPerf = 0;
      const workerDeadline = Date.now() + 5000;
      while (Date.now() < workerDeadline) {
        queuedPerf = (await (await client.request("/api/integrated/status/perf")).json() as { queued: number }).queued;
        if (queuedPerf === 20) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const workerMs = performance.now() - eventStarted;
      expect(queuedPerf).toBe(20);
      expect(routeMs).toBeLessThan(15_000);
      expect(formMs).toBeLessThan(15_000);
      expect(eventMs).toBeLessThan(15_000);
      expect(workerMs).toBeLessThan(15_000);
      console.log(`Bun performance sanity: 30 routes ${routeMs.toFixed(1)}ms, 20 Form Requests ${formMs.toFixed(1)}ms, 20 event dispatches ${eventMs.toFixed(1)}ms, worker drain ${workerMs.toFixed(1)}ms`);
      const cookie = [...client.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
      const socketUrl = new URL("/api/chat", origin);
      socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
      const socketScript = `const socket = new WebSocket(process.env.BUNWIRE_SOCKET_URL, { headers: { Cookie: process.env.BUNWIRE_COOKIE } });
        let opened = false; let received = 0; const started = performance.now(); const timeout = setTimeout(() => process.exit(2), 10000);
        socket.addEventListener("message", (event) => { const data = JSON.parse(String(event.data));
          if (data.event === "open") { opened = true; socket.send("hello"); }
          else { received++; if (received < 20) socket.send("hello");
            else { clearTimeout(timeout); console.log(JSON.stringify({ opened, received, durationMs: performance.now() - started, ...data })); socket.close(); } } });
        socket.addEventListener("error", () => { console.error("socket handshake failed"); process.exit(1); });`;
      const socketResult = await execFileAsync("bun", ["-e", socketScript], { cwd: root,
        env: { ...process.env, BUNWIRE_SOCKET_URL: socketUrl.href, BUNWIRE_COOKIE: cookie }, timeout: 8000 });
      const socketData = JSON.parse(socketResult.stdout.trim()) as { durationMs: number };
      expect(socketData).toMatchObject({ opened: true, received: 20, event: "message", identity: { userId: "example-user" }, text: "hello" });
      expect(socketData.durationMs).toBeLessThan(10_000);
      expect((await client.request("/api/logout")).status).toBe(200);
      expect((await client.request("/api/account")).status).toBe(401);
      child.stdin.write("stop\n");
      await waitUntil(() => output.includes("BUNWIRE_EXAMPLE_STOPPED") || child.exitCode !== null, () => output);
      expect(output).toContain("BUNWIRE_EXAMPLE_STOPPED");
      await waitUntil(() => child.exitCode !== null, () => output);
      expect(child.exitCode).toBe(0);
    } finally {
      if (child.exitCode === null) child.kill();
    }
  }, 45000);
});
