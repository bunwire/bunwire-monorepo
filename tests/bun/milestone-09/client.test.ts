import { describe, expect, it, vi } from "vitest";
import { createBunwirePageClient } from "@bunwire/bun/client";
import { Link, createBunwireReactApp, usePage } from "@bunwire/bun/react";

function browser() {
  let href = "http://example.test/start";
  const location = {
    get href() { return href; },
    get origin() { return new URL(href).origin; },
    get pathname() { return new URL(href).pathname; },
    get search() { return new URL(href).search; },
    assign(value: string) { href = new URL(value, href).href; },
  };
  const history = {
    pushState(_state: unknown, _title: string, value: string) { href = new URL(value, href).href; },
    replaceState(_state: unknown, _title: string, value: string) { href = new URL(value, href).href; },
  };
  const listeners = new Map<string, EventListener>();
  return {
    window: {
      location, history, scrollTo: vi.fn(),
      addEventListener: vi.fn((name: string, listener: EventListener) => listeners.set(name, listener)),
      removeEventListener: vi.fn((name: string) => listeners.delete(name)),
    } as unknown as Window,
    document: { addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as Document,
    location,
    listeners,
  };
}

describe("Bun Milestone 9 — framework-neutral page client", () => {
  it("exposes the browser-only React renderer surface", () => {
    expect(typeof createBunwireReactApp).toBe("function");
    expect(typeof Link).toBe("function");
    expect(typeof usePage).toBe("function");
  });

  it("renders the initial component and performs versioned navigation", async () => {
    const platform = browser();
    const render = vi.fn();
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("X-Bunwire-Page")).toBe("true");
      expect(new Headers(init.headers).get("X-Bunwire-Version")).toBe("v1");
      return new Response(JSON.stringify({ component: "Next", props: { value: 2 }, url: "/next", version: "v1" }), {
        headers: { "Content-Type": "application/json", "X-Bunwire-Page": "true" },
      });
    });
    const client = createBunwirePageClient({
      initialPage: { component: "Start", props: { value: 1 }, url: "/start", version: "v1" },
      resolvePage: (name) => `${name}Component`, render,
      window: platform.window, document: platform.document, fetch: fetcher as unknown as typeof fetch,
    });
    await client.start();
    expect(client.component).toBe("StartComponent");
    await client.visit("/next");
    expect(client.page.props).toEqual({ value: 2 });
    expect(platform.location.pathname).toBe("/next");
    expect(render).toHaveBeenCalledTimes(2);
    platform.listeners.get("popstate")?.(new Event("popstate"));
    await vi.waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(render).toHaveBeenCalledTimes(3);
    });
    client.stop();
  });

  it("uses native location assignment for external URLs and version reloads", async () => {
    const platform = browser();
    const fetcher = vi.fn(async () => new Response(null, { status: 409, headers: { "X-Bunwire-Location": "http://example.test/reload" } }));
    const client = createBunwirePageClient({
      initialPage: { component: "Start", props: {}, url: "/start", version: "v1" },
      resolvePage: () => "component", render: () => undefined,
      window: platform.window, document: platform.document, fetch: fetcher as unknown as typeof fetch,
    });
    await client.start();
    await client.visit("/stale");
    expect(platform.location.pathname).toBe("/reload");
    await client.visit("https://external.test/path");
    expect(platform.location.href).toBe("https://external.test/path");
  });
});
