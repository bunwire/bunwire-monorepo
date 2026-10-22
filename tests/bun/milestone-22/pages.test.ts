import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { Link, usePage } from "@bunwire/bun/react";
import { renderBunwireReactPage } from "@bunwire/bun/react/server";
import {
  BUN_PAGE_CAPABILITY_HEADER,
  BUN_PAGE_DEFERRED_PROPS_HEADER,
  BUN_PAGE_PARTIAL_COMPONENT_HEADER,
  BUN_PAGE_PARTIAL_PROPS_HEADER,
  BunAuthorizationException,
  BunPageManager,
  BunPageError,
  defer,
  page,
  type BunHttpContext,
} from "@bunwire/bun";

const manifest = { protocol: 1, mode: "development", components: ["Dashboard"], entry: "http://localhost:5173/src/client.tsx" } as const;
const context = (headers: HeadersInit = {}): BunHttpContext => ({
  request: new Request("http://example.test/dashboard", { headers }),
} as BunHttpContext);

describe("Bun Milestone 22 — page protocol", () => {
  it("keeps version 1 responses complete and negotiates deferred props in version 2", async () => {
    const resolver = vi.fn(async () => "resolved");
    const result = page("Dashboard", { title: "Now", later: defer(resolver) });
    const manager = new BunPageManager({ manifest });
    const old = await manager.resolve(result, context({ "X-Bunwire-Page": "true" }));
    expect(await old.json()).toEqual({ component: "Dashboard", props: { title: "Now", later: "resolved" }, url: "/dashboard" });
    expect(resolver).toHaveBeenCalledTimes(1);

    const modern = await manager.resolve(result, context({ "X-Bunwire-Page": "true", [BUN_PAGE_CAPABILITY_HEADER]: "2" }));
    expect(await modern.json()).toEqual({ component: "Dashboard", props: { title: "Now" }, url: "/dashboard", deferred: ["later"] });
    expect(resolver).toHaveBeenCalledTimes(1);

    const later = await manager.resolve(result, context({
      "X-Bunwire-Page": "true", [BUN_PAGE_CAPABILITY_HEADER]: "2",
      [BUN_PAGE_PARTIAL_COMPONENT_HEADER]: "Dashboard", [BUN_PAGE_DEFERRED_PROPS_HEADER]: '["later"]',
    }));
    expect(await later.json()).toEqual({ component: "Dashboard", props: { later: "resolved" }, url: "/dashboard", partial: ["later"] });
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it("preserves special JSON prop names without changing object prototypes", async () => {
    const result = page("Dashboard", JSON.parse('{"__proto__":{"safe":1}}') as Record<string, unknown>);
    const response = await new BunPageManager({ manifest }).resolve(result, context({ "X-Bunwire-Page": "true" }));
    const value = await response.json() as { props: Record<string, unknown> };
    expect(Object.hasOwn(value.props, "__proto__")).toBe(true);
    expect(value.props["__proto__"]).toEqual({ safe: 1 });
  });

  it("selects props after shared resolvers and preserves controller precedence", async () => {
    const shared = vi.fn(() => ({ title: "shared", user: "current" }));
    const manager = new BunPageManager({ manifest, shared });
    const response = await manager.resolve(page("Dashboard", { title: "controller", count: 3 }), context({
      "X-Bunwire-Page": "true", [BUN_PAGE_CAPABILITY_HEADER]: "2",
      [BUN_PAGE_PARTIAL_COMPONENT_HEADER]: "Dashboard", [BUN_PAGE_PARTIAL_PROPS_HEADER]: '["title","user"]',
    }));
    expect(await response.json()).toEqual({ component: "Dashboard", props: { title: "controller", user: "current" }, url: "/dashboard", partial: ["title", "user"] });
    expect(shared).toHaveBeenCalledTimes(1);
  });

  it("keeps deferred controller props ahead of shared props until selected", async () => {
    const manager = new BunPageManager({ manifest, shared: () => ({ later: "shared" }) });
    const result = page("Dashboard", { later: defer(() => "controller") });
    const initial = await manager.resolve(result, context({ "X-Bunwire-Page": "true", [BUN_PAGE_CAPABILITY_HEADER]: "2" }));
    expect(await initial.json()).toMatchObject({ props: {}, deferred: ["later"] });
    const selected = await manager.resolve(result, context({
      "X-Bunwire-Page": "true", [BUN_PAGE_CAPABILITY_HEADER]: "2",
      [BUN_PAGE_PARTIAL_COMPONENT_HEADER]: "Dashboard", [BUN_PAGE_PARTIAL_PROPS_HEADER]: '["later"]',
    }));
    expect(await selected.json()).toMatchObject({ props: { later: "controller" }, partial: ["later"] });
  });

  it("runs shared authorization checks for partial and deferred selections", async () => {
    const guard = vi.fn(({ http }: { http: BunHttpContext }) => {
      if (http.request.headers.get("X-Allowed") !== "yes") throw new BunAuthorizationException();
      return { allowed: true };
    });
    const manager = new BunPageManager({ manifest, shared: guard });
    const result = page("Dashboard", { secret: defer(() => "secret") });
    for (const selection of [BUN_PAGE_PARTIAL_PROPS_HEADER, BUN_PAGE_DEFERRED_PROPS_HEADER]) {
      await expect(manager.resolve(result, context({
        "X-Bunwire-Page": "true", [BUN_PAGE_CAPABILITY_HEADER]: "2",
        [BUN_PAGE_PARTIAL_COMPONENT_HEADER]: "Dashboard", [selection]: '["secret"]',
      }))).rejects.toBeInstanceOf(BunAuthorizationException);
    }
    expect(guard).toHaveBeenCalledTimes(2);
  });

  it("cancels deferred evaluation before a response escapes its request", async () => {
    const abort = new AbortController();
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => { finish = resolve; });
    const result = page("Dashboard", { later: defer(async () => { await waiting; return "done"; }) });
    const request = new Request("http://example.test/dashboard", { signal: abort.signal, headers: {
      "X-Bunwire-Page": "true", [BUN_PAGE_CAPABILITY_HEADER]: "2",
      [BUN_PAGE_PARTIAL_COMPONENT_HEADER]: "Dashboard", [BUN_PAGE_DEFERRED_PROPS_HEADER]: '["later"]',
    } });
    const response = new BunPageManager({ manifest }).resolve(result, { request } as BunHttpContext);
    abort.abort();
    finish();
    await expect(response).rejects.toBeInstanceOf(BunPageError);
  });

  it("supports optional SSR while escaping initial page state", async () => {
    const ssr = vi.fn(() => "<h1>Server</h1>");
    const response = await new BunPageManager({ manifest, ssr }).resolve(
      page("Dashboard", { unsafe: "</script><img src=x>" }), context(),
    );
    const html = await response.text();
    expect(html).toContain('<div id="app" data-bunwire-ssr="true"><h1>Server</h1></div>');
    expect(html).not.toContain("</script><img");
    expect(html).toContain("\\u003c/script\\u003e");
    expect(ssr).toHaveBeenCalledTimes(1);
  });

  it("renders React pages and hooks through the optional server entry", async () => {
    const Component = () => {
      const current = usePage();
      return createElement("main", null,
        createElement("h1", null, current.props.title as string),
        createElement(Link, { href: "/next" }, "Next"));
    };
    const html = await renderBunwireReactPage(
      { component: "Dashboard", props: { title: "Safe <title>" }, url: "/dashboard" },
      () => Component,
    );
    expect(html).toContain("Safe &lt;title&gt;");
    expect(html).toContain('href="/next"');
  });
});
