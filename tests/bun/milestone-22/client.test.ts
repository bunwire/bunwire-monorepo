import { describe, expect, it, vi } from "vitest";
import { createBunwirePageClient } from "@bunwire/bun/client";

function browser() {
  let href = "http://example.test/dashboard";
  return {
    window: {
      location: {
        get href() { return href; }, get origin() { return new URL(href).origin; },
        get pathname() { return new URL(href).pathname; }, get search() { return new URL(href).search; },
        assign(value: string) { href = new URL(value, href).href; },
      },
      history: {
        pushState(_state: unknown, _title: string, value: string) { href = new URL(value, href).href; },
        replaceState(_state: unknown, _title: string, value: string) { href = new URL(value, href).href; },
      },
      scrollTo: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
    } as unknown as Window,
    document: { addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as Document,
  };
}

const response = (value: unknown, advanced = true): Response => new Response(JSON.stringify(value), {
  headers: { "X-Bunwire-Page": "true", ...(advanced ? { "X-Bunwire-Page-Protocol": "2" } : {}) },
});

describe("Bun Milestone 22 — page client", () => {
  it("serializes async renders and notifies subscribers in commit order", async () => {
    const platform = browser();
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    const events: string[] = [];
    const client = createBunwirePageClient({
      initialPage: { component: "Dashboard", props: {}, url: "/dashboard" },
      resolvePage: (name) => name,
      render: async ({ page }) => {
        events.push(`${page.component}:start`);
        if (page.component === "First") await delayed;
        events.push(`${page.component}:end`);
      },
      fetch: (async (url: string) => response({
        component: url.endsWith("/first") ? "First" : "Second", props: {},
        url: url.endsWith("/first") ? "/first" : "/second",
      })) as typeof fetch,
      ...platform,
    });
    await client.start();
    const notify = vi.fn();
    client.subscribe(notify);
    const first = client.visit("/first");
    await vi.waitFor(() => expect(events).toContain("First:start"));
    const second = client.visit("/second");
    await vi.waitFor(() => expect(client.page.component).toBe("First"));
    expect(events).not.toContain("Second:start");
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(["Dashboard:start", "Dashboard:end", "First:start", "First:end", "Second:start", "Second:end"]);
    expect(client.page.component).toBe("Second");
    expect(platform.window.location.pathname).toBe("/second");
    expect(notify).toHaveBeenCalledTimes(2);
    client.stop();
  });

  it("notifies the last committed page when a newer navigation fails", async () => {
    const platform = browser();
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    const client = createBunwirePageClient({
      initialPage: { component: "Dashboard", props: {}, url: "/dashboard" },
      resolvePage: (name) => name,
      render: ({ page }) => page.component === "First" ? delayed : undefined,
      fetch: (async (url: string) => {
        if (url.endsWith("/second")) throw new Error("navigation failed");
        return response({ component: "First", props: {}, url: "/first" });
      }) as typeof fetch,
      ...platform,
    });
    await client.start();
    const notify = vi.fn();
    client.subscribe(notify);
    const first = client.visit("/first");
    await vi.waitFor(() => expect(client.page.component).toBe("First"));
    await expect(client.visit("/second")).rejects.toThrow("navigation failed");
    release();
    await first;
    expect(client.page.component).toBe("First");
    expect(notify).toHaveBeenCalledTimes(1);
    client.stop();
  });

  it("does not block a newer commit when an obsolete render fails", async () => {
    const platform = browser();
    let reject!: (reason: Error) => void;
    const delayed = new Promise<void>((_resolve, fail) => { reject = fail; });
    const client = createBunwirePageClient({
      initialPage: { component: "Dashboard", props: {}, url: "/dashboard" },
      resolvePage: (name) => name,
      render: ({ page }) => page.component === "First" ? delayed : undefined,
      fetch: (async (url: string) => response({
        component: url.endsWith("/first") ? "First" : "Second", props: {},
        url: url.endsWith("/first") ? "/first" : "/second",
      })) as typeof fetch,
      ...platform,
    });
    await client.start();
    const first = client.visit("/first");
    await vi.waitFor(() => expect(client.page.component).toBe("First"));
    const second = client.visit("/second");
    reject(new Error("obsolete render failed"));
    await Promise.all([first, second]);
    expect(client.page.component).toBe("Second");
    client.stop();
  });

  it("skips a queued commit after stop", async () => {
    const platform = browser();
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    const render = vi.fn(({ page }: { page: { component: string } }) => page.component === "First" ? delayed : undefined);
    const client = createBunwirePageClient({
      initialPage: { component: "Dashboard", props: {}, url: "/dashboard" },
      resolvePage: (name) => name, render,
      fetch: (async (url: string) => response({
        component: url.endsWith("/first") ? "First" : "Second", props: {},
        url: url.endsWith("/first") ? "/first" : "/second",
      })) as typeof fetch,
      ...platform,
    });
    await client.start();
    const first = client.visit("/first");
    await vi.waitFor(() => expect(client.page.component).toBe("First"));
    const second = client.visit("/second");
    client.stop();
    release();
    await Promise.all([first, second]);
    expect(client.page.component).toBe("First");
    expect(render.mock.calls.map(([context]) => context.page.component)).toEqual(["Dashboard", "First"]);
  });

  it("merges partial props and completes deferred props for the current navigation", async () => {
    const platform = browser();
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      if (headers.has("X-Bunwire-Deferred-Props")) return response({ component: "Dashboard", props: { later: 8 }, url: "/dashboard", partial: ["later"] });
      return response({ component: "Dashboard", props: { count: 2 }, url: "/dashboard", partial: ["count"], deferred: ["later"] });
    });
    const client = createBunwirePageClient({
      initialPage: { component: "Dashboard", props: { count: 1, retained: "yes" }, url: "/dashboard" },
      resolvePage: () => "component", render: () => undefined, deferred: true,
      fetch: fetcher as unknown as typeof fetch, ...platform,
    });
    await client.start();
    await client.visit("/dashboard", { only: ["count"] });
    await vi.waitFor(() => expect(client.page.props).toEqual({ count: 2, retained: "yes", later: 8 }));
    expect(new Headers(fetcher.mock.calls[0]![1].headers).get("X-Bunwire-Partial-Props")).toBe('["count"]');
    client.stop();
  });

  it("does not commit a deferred response after a newer navigation", async () => {
    const platform = browser();
    let release!: (value: Response) => void;
    const deferred = new Promise<Response>((resolve) => { release = resolve; });
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      if (headers.has("X-Bunwire-Deferred-Props")) return deferred;
      if (_url.endsWith("/next")) return response({ component: "Next", props: { current: true }, url: "/next" });
      return response({ component: "Dashboard", props: {}, url: "/dashboard", deferred: ["later"] });
    });
    const client = createBunwirePageClient({
      initialPage: { component: "Dashboard", props: {}, url: "/dashboard" },
      resolvePage: () => "component", render: () => undefined, deferred: true,
      fetch: fetcher as unknown as typeof fetch, ...platform,
    });
    await client.start();
    await client.visit("/dashboard");
    await client.visit("/next");
    release(response({ component: "Dashboard", props: { later: "stale" }, url: "/dashboard", partial: ["later"] }));
    await vi.waitFor(() => expect(client.page.component).toBe("Next"));
    expect(client.page.props).toEqual({ current: true });
    client.stop();
  });

  it("reports a deferred failure without erasing page props", async () => {
    const platform = browser();
    const onDeferredError = vi.fn();
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => new Headers(init.headers).has("X-Bunwire-Deferred-Props")
      ? new Response("failed", { status: 500 })
      : response({ component: "Dashboard", props: { count: 2 }, url: "/dashboard", deferred: ["later"] }));
    const client = createBunwirePageClient({
      initialPage: { component: "Dashboard", props: { count: 1 }, url: "/dashboard" },
      resolvePage: () => "component", render: () => undefined, deferred: true, onDeferredError,
      fetch: fetcher as unknown as typeof fetch, ...platform,
    });
    await client.start();
    await client.visit("/dashboard");
    await vi.waitFor(() => expect(onDeferredError).toHaveBeenCalledTimes(1));
    expect(client.page.props).toEqual({ count: 2 });
    client.stop();
  });
});
