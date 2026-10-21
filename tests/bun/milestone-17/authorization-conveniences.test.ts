import {
  AuthManager,
  AuthorizationManager,
  BunAuthorizationError,
  BunAuthorizationException,
  BunCookieJar,
  type BunAuthorizationPolicy,
  type BunAuthorizationPolicyCheck,
  type BunHttpContext,
  type BunHttpRequest,
} from "@bunwire/bun";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

interface Principal { readonly id: string; readonly role: "admin" | "member" }
interface Post { readonly id: string; readonly owner: string }

function http(params: Readonly<Record<string, string>> = { post: "42" }): BunHttpContext<Principal> {
  const request = Object.assign(new Request("http://local/posts/42"), { params }) as BunHttpRequest;
  return {
    requestId: "authorization-test",
    request,
    server: {} as never,
    route: { method: "GET", path: "/posts/:post", params },
    scope: {} as never,
    cookies: new BunCookieJar(request),
  };
}

async function configured(principal?: Principal) {
  const resolve = vi.fn(async (value: string): Promise<Post> => ({ id: value, owner: "user-1" }));
  const policy: BunAuthorizationPolicy<Principal, Post> = {
    name: "post",
    resolve,
    abilities: { update: ({ principal: user, resource }) => user?.id === resource?.owner },
  };
  const manager = new AuthorizationManager<Principal>({
    abilities: { "dashboard.view": ({ principal: user }) => user?.role === "admin" },
    policies: [policy],
  });
  const current = http();
  if (!principal) return { authorization: manager.createContext(() => current), resolve };
  const authManager = new AuthManager<Principal>({
    defaultGuard: "fixed",
    guards: [{ name: "fixed", authenticate: () => principal }],
  });
  const auth = authManager.createContext(() => current);
  await auth.authenticate();
  return { authorization: manager.createContext(() => current, auth), resolve };
}

describe("Bun Milestone 17 — authorization conveniences", () => {
  it("keeps global allow, deny, and assertion results aligned with can()", async () => {
    const { authorization } = await configured({ id: "user-1", role: "admin" });
    expect(await authorization.can("dashboard.view")).toBe(true);
    expect(await authorization.allows("dashboard.view")).toBe(true);
    expect(await authorization.denies("dashboard.view")).toBe(false);
    await expect(authorization.authorize("dashboard.view")).resolves.toBeUndefined();
    expect(await authorization.allows("missing")).toBe(false);
    expect(await authorization.denies("missing")).toBe(true);
    await expect(authorization.authorize("missing")).rejects.toBeInstanceOf(BunAuthorizationException);
  });

  it("binds a named policy to an explicit resource without resolving the route", async () => {
    const { authorization, resolve } = await configured({ id: "user-1", role: "member" });
    const owned: Post = { id: "alternate", owner: "user-1" };
    const check = authorization.policy("post", owned);
    expect(Object.isFrozen(check)).toBe(true);
    expect(check.name).toBe("post");
    expect(check.resource).toBe(owned);
    expect(await check.allows("update")).toBe(true);
    expect(await check.denies("update")).toBe(false);
    await expect(check.authorize("update")).resolves.toBeUndefined();
    expect(resolve).not.toHaveBeenCalled();
    expectTypeOf(check).toEqualTypeOf<BunAuthorizationPolicyCheck<Post>>();
    expectTypeOf(check.resource).toEqualTypeOf<Post | undefined>();

    const other = authorization.policy("post", { id: "alternate", owner: "other" });
    expect(await other.denies("update")).toBe(true);
    await expect(other.authorize("update")).rejects.toBeInstanceOf(BunAuthorizationException);
  });

  it("reuses route resolution when no resource is supplied", async () => {
    const { authorization, resolve } = await configured({ id: "user-1", role: "member" });
    expect(await authorization.policy("post").allows("update")).toBe(true);
    expect(resolve).toHaveBeenCalledWith("42", expect.any(Object));
    expect(await authorization.allows("update", { policy: "post" })).toBe(true);
    expect(await authorization.denies("update", { policy: "post" })).toBe(false);
  });

  it("denies anonymous or missing policy checks and rejects malformed identifiers", async () => {
    const { authorization } = await configured();
    expect(await authorization.allows("dashboard.view")).toBe(false);
    expect(await authorization.policy("post").denies("update")).toBe(true);
    expect(await authorization.policy("absent").allows("update")).toBe(false);
    expect(await authorization.policy("post").allows("absent")).toBe(false);
    await expect(authorization.policy("absent").authorize("update")).rejects.toBeInstanceOf(BunAuthorizationException);
    await expect(authorization.allows("bad ability")).rejects.toBeInstanceOf(BunAuthorizationError);
    expect(() => authorization.policy("bad-policy")).toThrow(BunAuthorizationError);
  });
});
