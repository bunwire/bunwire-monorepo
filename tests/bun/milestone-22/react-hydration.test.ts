import { Window } from "happy-dom";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBunwireReactApp, usePage } from "@bunwire/bun/react";
import { renderBunwireReactPage } from "@bunwire/bun/react/server";

afterEach(() => vi.unstubAllGlobals());

describe("Bun Milestone 22 — React hydration", () => {
  it("hydrates an SSR page and continues client navigation without replacing its host", async () => {
    const browser = new Window({ url: "http://example.test/dashboard" });
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", browser.document);
    vi.stubGlobal("Element", browser.Element);
    vi.stubGlobal("HTMLElement", browser.HTMLElement);
    vi.stubGlobal("Node", browser.Node);
    const Component = () => createElement("h1", null, usePage().props.title as string);
    const initialPage = { component: "Dashboard", props: { title: "Server" }, url: "/dashboard" } as const;
    const markup = await renderBunwireReactPage(initialPage, () => Component);
    const host = browser.document.createElement("div");
    host.id = "app";
    host.setAttribute("data-bunwire-ssr", "true");
    host.innerHTML = markup;
    browser.document.body.append(host);
    const app = await createBunwireReactApp({
      initialPage, resolvePage: () => Component,
      window: browser as unknown as Window & globalThis.Window,
      document: browser.document as unknown as Document,
      fetch: (async () => new Response(JSON.stringify({ component: "Dashboard", props: { title: "Client" }, url: "/dashboard" }),
        { headers: { "X-Bunwire-Page": "true" } })) as unknown as typeof fetch,
    });
    expect(browser.document.getElementById("app")).toBe(host);
    await app.client.visit("/dashboard");
    await vi.waitFor(() => expect(host.textContent).toBe("Client"));
    app.unmount();
  });
});
