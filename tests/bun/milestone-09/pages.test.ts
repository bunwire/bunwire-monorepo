import { describe, expect, it } from "vitest";
import {
  BUN_PAGE_LOCATION_HEADER,
  BUN_PAGE_RESPONSE_HEADER,
  BUN_PAGE_VERSION_HEADER,
  BunCookieJar,
  BunAdapter,
  BunPageComponentError,
  BunPageManager,
  BunValidationException,
  MemorySessionStore,
  SessionManager,
  page,
  type BunHttpContext,
  type BunPageManifest,
} from "@bunwire/bun";

const developmentManifest: BunPageManifest = Object.freeze({
  protocol: 1,
  mode: "development",
  components: Object.freeze(["Dashboard"]),
  entry: "http://localhost:5173/src/client.tsx",
});

function context(request: Request, extra: Partial<BunHttpContext> = {}): BunHttpContext {
  return { request, ...extra } as unknown as BunHttpContext;
}

describe("Bun Milestone 9 — server-driven pages", () => {
  it("renders an injection-safe initial shell and navigation JSON", async () => {
    const manager = new BunPageManager({ manifest: developmentManifest });
    const initial = await manager.resolve(
      page("Dashboard", { unsafe: "</script><img src=x onerror=alert(1)>" }),
      context(new Request("http://example.test/dashboard?tab=one")),
    );
    expect(initial.headers.get("Content-Type")).toContain("text/html");
    expect(initial.headers.get(BUN_PAGE_RESPONSE_HEADER)).toBe("true");
    const html = await initial.text();
    expect(html).toContain('id="bunwire-page"');
    expect(html).not.toContain("</script><img");
    expect(html).toContain("\\u003c/script\\u003e");

    const navigation = await manager.resolve(
      page("Dashboard", { count: 1 }),
      context(new Request("http://example.test/dashboard?tab=one", { headers: { "X-Bunwire-Page": "true" } })),
    );
    expect(navigation.headers.get("Content-Type")).toContain("application/json");
    await expect(navigation.json()).resolves.toEqual({ component: "Dashboard", props: { count: 1 }, url: "/dashboard?tab=one" });
  });

  it("merges framework, ordered shared, flash, and controller props deterministically", async () => {
    const store = new MemorySessionStore();
    const sessions = await SessionManager.create({ secret: "0123456789abcdef0123456789abcdef", store, cookie: { secure: false } });
    const firstCookies = new BunCookieJar(new Request("http://example.test/form") as never, [sessions.cookieName]);
    const first = await sessions.open(firstCookies);
    first.session.flash("notice", "saved");
    const validation = new BunValidationException({ email: ["Required"] }, "Validation Failed", { email: "old@example.test" });
    const redirect = new BunPageManager({ manifest: developmentManifest }).handleException(
      validation,
      context(new Request("http://example.test/form", { method: "POST", headers: { "X-Bunwire-Page": "true", Referer: "http://example.test/dashboard" } }), { session: first.session }),
    );
    expect(redirect?.status).toBe(303);
    const committed = await first.commit(redirect!);
    const cookie = committed.headers.get("Set-Cookie")!.split(";")[0]!;

    const secondCookies = new BunCookieJar(new Request("http://example.test/dashboard", { headers: { Cookie: cookie } }) as never, [sessions.cookieName]);
    const second = await sessions.open(secondCookies);
    const manager = new BunPageManager({
      manifest: developmentManifest,
      flash: { notice: "notice" },
      shared: [
        ({ auth, http }) => ({
          order: "first", shared: true,
          auth: { principal: auth?.principal ?? null },
          csrfToken: http.csrf ? "csrf-from-context" : null,
        }),
        () => ({ order: "second" }),
      ],
    });
    const response = await manager.resolve(
      page("Dashboard", { order: "controller" }),
      context(new Request("http://example.test/dashboard", { headers: { "X-Bunwire-Page": "true" } }), {
        session: second.session,
        auth: { principal: { id: "user-1" } } as never,
        csrf: {} as never,
      }),
    );
    expect((await response.clone().json()).props).toEqual({
      errors: { email: ["Required"] }, old: { email: "old@example.test" },
      order: "controller", shared: true, notice: "saved",
      auth: { principal: { id: "user-1" } }, csrfToken: "csrf-from-context",
    });
    await second.commit(response);
  });

  it("forces a full reload for stale production versions and rejects missing components", async () => {
    const manager = new BunPageManager({ manifest: {
      protocol: 1, mode: "production", components: ["Dashboard"], entry: "/assets/app.js",
      version: "current", assetRoot: "dist/client", assets: ["/assets/app.js"],
    } });
    const response = await manager.resolve(page("Dashboard"), context(new Request("http://example.test/dashboard", {
      headers: { "X-Bunwire-Page": "true", [BUN_PAGE_VERSION_HEADER]: "stale" },
    })));
    expect(response.status).toBe(409);
    expect(response.headers.get(BUN_PAGE_LOCATION_HEADER)).toBe("http://example.test/dashboard");
    const redirect = manager.finalize(
      new Response(null, { status: 302, headers: { Location: "/next" } }),
      context(new Request("http://example.test/update", { method: "POST", headers: { "X-Bunwire-Page": "true" } })),
    );
    expect(redirect.status).toBe(303);
    expect(redirect.headers.get(BUN_PAGE_RESPONSE_HEADER)).toBe("true");
    await expect(manager.resolve(page("Missing"), context(new Request("http://example.test/"))))
      .rejects.toBeInstanceOf(BunPageComponentError);
  });

  it("rejects malformed adapter page configuration during construction", () => {
    expect(() => new BunAdapter({ http: { pages: { manifest: { ...developmentManifest, components: [] } } } }))
      .toThrow(/components must be a non-empty array/i);
    expect(() => new BunAdapter({ http: { pages: { manifest: developmentManifest, flash: { notice: "" } } } }))
      .toThrow(/flash mappings/i);
  });
});
