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
