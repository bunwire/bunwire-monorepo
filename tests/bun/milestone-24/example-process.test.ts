import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BunTestClient } from "@bunwire/bun/testing";

const exampleRoot = fileURLToPath(new URL("../../../examples/bun-app/", import.meta.url));
const channelsClient = fileURLToPath(new URL("./fixtures/channels-client.ts", import.meta.url));
const execFileAsync = promisify(execFile);

async function waitUntil(check: () => boolean, detail: () => string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${detail()}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("Bun Milestone 24 integrated v2 example", () => {
  it("combines signed auth/throttle, page uploads and authorization, operational state, and channels", async () => {
    const child: ChildProcessWithoutNullStreams = spawn("bun", ["src/main.ts"], {
      cwd: exampleRoot, stdio: "pipe", env: { ...process.env, BUNWIRE_EXAMPLE_INTEGRATED: "1",
        BUNWIRE_EXAMPLE_PORT: "0", BUNWIRE_EXAMPLE_OPERATOR_KEY: "test-operator", BUNWIRE_EXAMPLE_SSR: "1" },
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    try {
      await waitUntil(() => output.includes("BUNWIRE_EXAMPLE_READY") || child.exitCode !== null, () => output);
      const origin = output.match(/BUNWIRE_EXAMPLE_READY (https?:\/\/\S+)/)?.[1];
      if (!origin) throw new Error(`Example did not start:\n${output}`);
      const client = new BunTestClient(origin);
      const guest = new BunTestClient(origin);
      expect((await client.request("/health/live")).status).toBe(200);
      expect((await client.request("/health/ready")).status).toBe(200);
      const html = await (await client.request("/api/page")).text();
      expect(html).toContain('data-bunwire-ssr="true"');
      expect(html).toContain("Bunwire Pages");
      expect((await guest.request("/api/v2/report-link/42")).status).toBe(401);
      expect((await client.request("/api/login")).status).toBe(200);
      const { href } = await (await client.request("/api/v2/report-link/42")).json() as { href: string };
      expect((await guest.request(href)).status).toBe(401);
      expect((await client.request(href.replace("/report/42", "/report/43"))).status).toBe(403);
      expect((await client.request(href)).status).toBe(200);
      expect((await client.request(href)).status).toBe(200);
      expect((await client.request(href)).status).toBe(429);
      const reports = await (await client.request("/api/v2/reports?filter=demo&page=2&perPage=2")).json() as
        { items: string[]; links: { next?: string } };
      expect(reports.items).toEqual(["third", "fourth"]);
      expect(reports.links.next).toContain("filter=demo");

      const session = await (await client.request("/api/session")).json() as { csrfToken: string };
      const invalid = new FormData();
      invalid.append("upload", new File(["bad"], "bad.txt", { type: "text/plain" }));
      const rejected = await client.csrfRequest("/api/v2/upload", session.csrfToken, { method: "POST",
        headers: { "X-Bunwire-Page": "true", Referer: `${origin}api/v2/upload-page` },
        body: invalid, redirect: "manual" });
      expect(rejected.status).toBe(303);
      const uploadPage = await client.request("/api/v2/upload-page", { headers: { "X-Bunwire-Page": "true" } });
      expect((await uploadPage.json() as { props: { errors: object } }).props.errors).toBeDefined();
      const valid = new FormData();
      valid.append("upload", new File(["png"], "safe.png", { type: "image/png" }));
      const accepted = await client.csrfRequest("/api/v2/upload", session.csrfToken, { method: "POST", body: valid });
      expect(await accepted.json()).toMatchObject({ name: "safe.png", size: 3 });

      const pagePath = "/api/v2/private-page";
      const pageHeaders = { "X-Bunwire-Page": "true", "X-Bunwire-Page-Protocol": "2" };
      expect((await guest.request(pagePath, { headers: pageHeaders })).status).toBe(401);
      const initial = await client.request(pagePath, { headers: pageHeaders });
      expect(await initial.json()).toMatchObject({ props: { role: "admin", canView: true }, deferred: ["details"] });
      const partialHeaders = { ...pageHeaders, "X-Bunwire-Partial-Component": "Dashboard",
        "X-Bunwire-Partial-Props": '["role"]' };
      expect(await (await client.request(pagePath, { headers: partialHeaders })).json()).toMatchObject({ props: { role: "admin" }, partial: ["role"] });
      expect((await guest.request(pagePath, { headers: partialHeaders })).status).toBe(401);
      const deferredHeaders = { ...pageHeaders, "X-Bunwire-Partial-Component": "Dashboard",
        "X-Bunwire-Deferred-Props": '["details"]' };
      expect(await (await client.request(pagePath, { headers: deferredHeaders })).json()).toMatchObject({ props: { details: { owner: "example-user" } } });
      expect((await guest.request(pagePath, { headers: deferredHeaders })).status).toBe(401);

      const cookie = [...client.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
      const socketUrl = new URL("/api/v2/chat", origin);
      socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
      const channels = await execFileAsync("bun", [channelsClient], { cwd: exampleRoot, timeout: 15_000,
        env: { ...process.env, BUNWIRE_SOCKET_URL: socketUrl.href, BUNWIRE_COOKIE: cookie } });
      const received = JSON.parse(channels.stdout.trim()) as string[][];
      expect(received[0]!.map((item) => JSON.parse(item))).toContainEqual({ event: "join", allowed: true });
      expect(received[1]!.map((item) => JSON.parse(item))).toContainEqual({ event: "join", allowed: false });
      expect(received[1]!.some((item) => item.includes('"text":"shared"'))).toBe(true);

      child.stdin.write("maintenance:on\n");
      await waitUntil(() => output.includes("BUNWIRE_EXAMPLE_MAINTENANCE_ON"), () => output);
      expect((await client.request("/api")).status).toBe(503);
      expect((await client.request("/health/live")).status).toBe(200);
      expect((await client.request("/health/ready")).status).toBe(503);
      expect((await client.request("/api", { headers: { "X-Example-Operator-Key": "test-operator" } })).status).toBe(200);
      child.stdin.write("maintenance:off\n");
      await waitUntil(() => output.includes("BUNWIRE_EXAMPLE_MAINTENANCE_OFF"), () => output);
      expect((await client.request("/health/ready")).status).toBe(200);
      child.stdin.write("stop\n");
      await waitUntil(() => output.includes("BUNWIRE_EXAMPLE_STOPPED") || child.exitCode !== null, () => output);
      expect(output).toContain("BUNWIRE_EXAMPLE_STOPPED");
      await waitUntil(() => child.exitCode !== null, () => output);
      expect(child.exitCode).toBe(0);
    } finally { if (child.exitCode === null) child.kill(); }
  }, 90_000);

  it("inspects generated routes and exits without interactive input", async () => {
    const result = await execFileAsync("bun", ["inspect.ts", "routes:list"], { cwd: exampleRoot,
      env: { ...process.env, CI: "1" }, timeout: 15_000 });
    expect(result.stdout).toContain("/api/v2/report/:id");
    expect(result.stdout).toContain("/api/v2/private-page");
  }, 20_000);
});
