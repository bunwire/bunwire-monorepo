import {
  AuthManager,
  BunCookieJar,
  BunOAuthCallbackException,
  OAuthManager,
  SessionManager,
  createOAuth2Provider,
  createSessionAuthGuard,
  type BunHttpContext,
  type BunHttpRequest,
  type BunOAuthProvider,
  type Session,
} from "@bunwire/bun";
import { describe, expect, it, vi } from "vitest";

interface Principal { readonly id: string; }

function request(url = "http://local/oauth/callback"): BunHttpRequest {
  return Object.assign(new Request(url), { params: {} }) as unknown as BunHttpRequest;
}

function http(native: BunHttpRequest, session: Session): BunHttpContext<Principal> {
  return {
    request: native,
    server: {} as never,
    route: { method: "GET", path: "/oauth/callback", params: {} },
    scope: {} as never,
    cookies: new BunCookieJar(native),
    session,
  };
}

async function harness(provider: BunOAuthProvider<any, Principal>, lifetime = 600) {
  const sessions = await SessionManager.create({
    secret: "0123456789abcdef0123456789abcdef",
    cookie: { secure: false },
  });
  const lease = await sessions.open(new BunCookieJar(request(), [sessions.cookieName]));
  let current = http(request(), lease.session);
  const authManager = new AuthManager<Principal>({
    defaultGuard: "session",
    guards: [createSessionAuthGuard({
      identify: (principal: Principal) => principal.id,
      resolve: (id: string) => ({ id }),
    })],
  });
  const auth = authManager.createContext(() => current);
  await auth.authenticate();
  const oauth = new OAuthManager({
    providers: [provider],
    stateLifetimeSeconds: lifetime,
    mapIdentity: ({ identity }) => ({ id: (identity as { subject: string }).subject }),
  }, authManager).createContext(() => current, auth, lease.session);
  return { auth, lease, oauth, setRequest(url: string) { current = http(request(url), lease.session); } };
}

describe("Bun Milestone 8 — OAuth", () => {
  it("stores state and PKCE server-side, consumes callbacks once, maps identity, and logs in", async () => {
    const authorization = vi.fn(({ state, codeChallenge }: { state: string; codeChallenge: string }) => (
      new URL(`https://provider.test/authorize?state=${state}&challenge=${codeChallenge}`)
    ));
    const callback = vi.fn(async () => ({ subject: "external-1" }));
    const state = await harness({ name: "fake", authorizationUrl: authorization, callback });
    const result = await state.oauth.redirect("fake");
    const target = new URL(result.location);
    const suppliedState = target.searchParams.get("state")!;
    expect(target.searchParams.get("challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);

    state.setRequest(`http://local/oauth/callback?code=ok&state=${suppliedState}`);
    const completed = await state.oauth.callback<{ subject: string }>("fake");
    expect(completed).toEqual({ provider: "fake", identity: { subject: "external-1" }, principal: { id: "external-1" } });
    expect(state.auth.principal).toEqual({ id: "external-1" });
    await expect(state.oauth.callback("fake")).rejects.toBeInstanceOf(BunOAuthCallbackException);
    state.lease.release();
  });

  it("supports multiple pending flows and rejects missing, mismatched, and expired state", async () => {
    const clock = vi.spyOn(Date, "now");
    const startedAt = new Date().valueOf();
    clock.mockReturnValue(startedAt);
    const provider: BunOAuthProvider<{ subject: string }, Principal> = {
      name: "fake",
      authorizationUrl: ({ state }) => new URL(`https://provider.test/authorize?state=${state}`),
      callback: async () => ({ subject: "external" }),
    };
    const state = await harness(provider, 1);
    const first = new URL((await state.oauth.redirect("fake")).location).searchParams.get("state")!;
    const second = new URL((await state.oauth.redirect("fake")).location).searchParams.get("state")!;
    state.setRequest(`http://local/oauth/callback?code=ok&state=${second}`);
    await expect(state.oauth.callback("fake")).resolves.toMatchObject({ principal: { id: "external" } });
    clock.mockReturnValue(startedAt + 1_001);
    state.setRequest(`http://local/oauth/callback?code=ok&state=${first}`);
    await expect(state.oauth.callback("fake")).rejects.toBeInstanceOf(BunOAuthCallbackException);
    clock.mockRestore();
    state.lease.release();
  });

  it("uses oauth4webapi for Authorization Code exchange with PKCE", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = init?.body as URLSearchParams;
      expect(body.get("code")).toBe("code-1");
      expect(body.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]+$/);
      return new Response(JSON.stringify({ access_token: "token-1", token_type: "Bearer", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const provider = createOAuth2Provider<{ subject: string }, Principal>({
      name: "standard",
      issuer: "https://provider.test",
      authorizationEndpoint: "https://provider.test/authorize",
      tokenEndpoint: "https://provider.test/token",
      clientId: "client-1",
      clientSecret: "secret-1",
      redirectUri: "http://local/oauth/callback",
      scopes: ["profile"],
      fetch: fetcher as unknown as typeof fetch,
      resolveIdentity: (tokens) => ({ subject: tokens.accessToken }),
    });
    const state = await harness(provider);
    const target = new URL((await state.oauth.redirect("standard")).location);
    expect(target.searchParams.get("code_challenge_method")).toBe("S256");
    expect(target.searchParams.get("scope")).toBe("profile");
    state.setRequest(`http://local/oauth/callback?code=code-1&state=${target.searchParams.get("state")}`);
    await expect(state.oauth.callback("standard")).resolves.toMatchObject({ principal: { id: "token-1" } });
    expect(fetcher).toHaveBeenCalledOnce();
    state.lease.release();
  });
});
