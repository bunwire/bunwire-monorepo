import {
  AuthManager,
  AuthorizationManager,
  BunAuthError,
  BunAuthorizationException,
  BunCookieJar,
  SessionManager,
  createBearerAuthGuard,
  createSessionAuthGuard,
  type BunHttpContext,
  type BunHttpRequest,
} from "@bunwire/bun";
import { describe, expect, it, vi } from "vitest";

interface Principal { readonly id: string; readonly role: "admin" | "member"; }

function request(init: RequestInit = {}): BunHttpRequest {
  return Object.assign(new Request("http://local/posts/42", init), { params: { post: "42" } }) as unknown as BunHttpRequest;
}

function http(native = request(), session?: BunHttpContext<Principal>["session"]): BunHttpContext<Principal> {
  return {
    request: native,
    server: {} as never,
    route: { method: "GET", path: "/posts/:post", params: { post: "42" } },
    scope: {} as never,
    cookies: new BunCookieJar(native),
    ...(session ? { session } : {}),
  };
}

async function sessions() {
  return SessionManager.create({
    secret: "0123456789abcdef0123456789abcdef",
    cookie: { secure: false },
  });
}

describe("Bun Milestone 8 — authentication and authorization", () => {
  it("persists only an application key, restores a fresh principal, and rotates login/logout sessions", async () => {
    const manager = await sessions();
    const firstLease = await manager.open(new BunCookieJar(request(), [manager.cookieName]));
    const resolve = vi.fn(async (id: string): Promise<Principal | undefined> => (
      id === "user-1" ? { id, role: "admin" } : undefined
    ));
    const authManager = new AuthManager<Principal>({
      defaultGuard: "session",
      guards: [createSessionAuthGuard({ identify: (principal: Principal) => principal.id, resolve })],
    });
    let firstHttp = http(request(), firstLease.session);
    const first = authManager.createContext(() => firstHttp);
    await first.authenticate();
    expect(first.guest()).toBe(true);
    const anonymousId = firstLease.session.id;
    await first.login({ id: "user-1", role: "member" });
    expect(firstLease.session.id).not.toBe(anonymousId);
    expect(first.user).toEqual({ id: "user-1", role: "member" });
    const response = await firstLease.commit(new Response());

    const cookie = response.headers.get("set-cookie")!.split(";", 1)[0]!;
    const restoredLease = await manager.open(new BunCookieJar(request({ headers: { Cookie: cookie } }), [manager.cookieName]));
    let restoredHttp = http(request(), restoredLease.session);
    const restored = authManager.createContext(() => restoredHttp);
    await restored.authenticate();
    expect(resolve).toHaveBeenCalledWith("user-1", expect.any(Object));
    expect(restored.principal).toEqual({ id: "user-1", role: "admin" });
    const authenticatedId = restoredLease.session.id;
    await restored.logout();
    expect(restored.guest()).toBe(true);
    expect(restoredLease.session.id).not.toBe(authenticatedId);
    await restoredLease.commit(new Response());
  });

  it("parses bearer credentials strictly and selects guards without fallback", async () => {
    const bearer = createBearerAuthGuard<Principal>({
      resolve: async (token) => token === "valid" ? { id: "api", role: "member" } : undefined,
    });
    const fallback = { name: "fallback", authenticate: vi.fn(() => ({ id: "fallback", role: "admin" } as Principal)) };
    const manager = new AuthManager({ defaultGuard: "bearer", guards: [bearer, fallback] });
    let current = http(request({ headers: { Authorization: "Bearer valid" } }));
    const context = manager.createContext(() => current);
    await context.authenticate();
    expect(context.principal?.id).toBe("api");
    expect(fallback.authenticate).not.toHaveBeenCalled();

    current = http(request({ headers: { Authorization: "Basic valid" } }));
    const anonymous = manager.createContext(() => current);
    await anonymous.authenticate();
    expect(anonymous.guest()).toBe(true);
    await expect(anonymous.login({ id: "x", role: "member" })).rejects.toThrow(BunAuthError);
  });

  it("evaluates global abilities and named policies with explicit route resource loading", async () => {
    const manager = new AuthorizationManager<Principal>({
      abilities: {
        "dashboard.view": ({ principal }) => principal?.role === "admin",
      },
      policies: [{
        name: "post",
        resolve: async (value) => ({ id: Number(value), owner: "user-1" }),
        abilities: {
          update: ({ principal, resource }) => principal?.id === resource.owner,
        },
      }],
    });
    const auth = new AuthManager<Principal>({
      defaultGuard: "fixed",
      guards: [{ name: "fixed", authenticate: () => ({ id: "user-1", role: "admin" }) }],
    });
    let current = http();
    const authContext = auth.createContext(() => current);
    await authContext.authenticate();
    const authorization = manager.createContext(() => current, authContext);
    expect(await authorization.can("dashboard.view")).toBe(true);
    expect(await authorization.can("update", { policy: "post" })).toBe(true);
    expect(await authorization.can("missing")).toBe(false);
    await expect(authorization.authorize("missing")).rejects.toBeInstanceOf(BunAuthorizationException);
  });

  it("rejects duplicate or malformed guard and policy configuration", () => {
    const guard = createBearerAuthGuard<Principal>({ resolve: () => undefined });
    expect(() => new AuthManager({ defaultGuard: "missing", guards: [guard] })).toThrow(/not registered/i);
    expect(() => new AuthManager({ defaultGuard: "bearer", guards: [guard, guard] })).toThrow(/more than once/i);
    expect(() => new AuthorizationManager({ policies: [
      { name: "post", abilities: { view: () => true } },
      { name: "post", abilities: { edit: () => true } },
    ] })).toThrow(/more than once/i);
  });
});
