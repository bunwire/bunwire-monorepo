import {
  BunCookieJar,
  CsrfManager,
  BunSessionError,
  MemorySessionStore,
  Session,
  SessionManager,
  type BunHttpRequest,
} from "@bunwire/bun";
import { describe, expect, it } from "vitest";

function request(cookie?: string): BunHttpRequest {
  return Object.assign(new Request("http://local/session", {
    ...(cookie ? { headers: { Cookie: cookie } } : {}),
  }), { params: {} }) as unknown as BunHttpRequest;
}

function cookieValue(response: Response): string {
  return response.headers.get("set-cookie")!.split(";", 1)[0]!;
}

async function manager(store = new MemorySessionStore()) {
  return SessionManager.create({
    secret: "0123456789abcdef0123456789abcdef",
    store,
    cookie: { secure: false },
  });
}

describe("Bun Milestone 7 — sessions", () => {
  it("requires a strong secret and serializable values", async () => {
    await expect(SessionManager.create({ secret: "short" })).rejects.toThrow(/32 UTF-8 bytes/i);
    expect(() => new (Session as unknown as new () => Session)()).toThrow(/SessionManager/i);
    const sessions = await manager();
    const lease = await sessions.open(new BunCookieJar(request(), [sessions.cookieName]));
    expect(() => lease.session.put("bad", new Date() as never)).toThrow(BunSessionError);
    lease.release();
  });

  it("uses secure cookie defaults, preserves multiple cookie mutations, and reserves the session name", async () => {
    const sessions = await SessionManager.create({ secret: "0123456789abcdef0123456789abcdef" });
    const jar = new BunCookieJar(request(), [sessions.cookieName]);
    expect(() => jar.set(sessions.cookieName, "forged")).toThrow(/reserved/i);
    jar.set("theme", "dark", { sameSite: "strict" }).set("locale", "en");
    const lease = await sessions.open(jar);
    const response = await lease.commit(new Response());
    const values = response.headers.getSetCookie();
    expect(values).toHaveLength(3);
    expect(values.find((value) => value.startsWith("bunwire_session="))).toMatch(/Secure.*HttpOnly.*SameSite=Lax/i);
  });

  it("commits, restores, regenerates, and rejects tampered signed IDs", async () => {
    const sessions = await manager();
    const first = await sessions.open(new BunCookieJar(request(), [sessions.cookieName]));
    first.session.put("count", 1);
    const originalId = first.session.id;
    const firstResponse = await first.commit(new Response("ok"));
    const cookie = cookieValue(firstResponse);

    const restored = await sessions.open(new BunCookieJar(request(cookie), [sessions.cookieName]));
    expect(restored.session.get("count")).toBe(1);
    restored.session.regenerate();
    expect(restored.session.id).not.toBe(originalId);
    const rotated = cookieValue(await restored.commit(new Response("rotated")));

    const next = await sessions.open(new BunCookieJar(request(rotated), [sessions.cookieName]));
    expect(next.session.get("count")).toBe(1);
    await next.commit(new Response());

    const tampered = await sessions.open(new BunCookieJar(request(`${rotated}x`), [sessions.cookieName]));
    expect(tampered.session.get("count")).toBeUndefined();
    await tampered.commit(new Response());
  });

  it("keeps flash for exactly the following request and supports old input", async () => {
    const sessions = await manager();
    const first = await sessions.open(new BunCookieJar(request(), [sessions.cookieName]));
    first.session.flash("notice", "saved").flashInput({ email: "a@example.test" });
    const cookie1 = cookieValue(await first.commit(new Response()));

    const second = await sessions.open(new BunCookieJar(request(cookie1), [sessions.cookieName]));
    expect(second.session.get("notice")).toBe("saved");
    expect(second.session.old("email")).toBe("a@example.test");
    const cookie2 = cookieValue(await second.commit(new Response()));

    const third = await sessions.open(new BunCookieJar(request(cookie2), [sessions.cookieName]));
    expect(third.session.get("notice")).toBeUndefined();
    expect(third.session.old("email")).toBeUndefined();
    await third.commit(new Response());
  });

  it("serializes requests sharing a session ID", async () => {
    const sessions = await manager();
    const seed = await sessions.open(new BunCookieJar(request(), [sessions.cookieName]));
    const cookie = cookieValue(await seed.commit(new Response()));
    const first = await sessions.open(new BunCookieJar(request(cookie), [sessions.cookieName]));
    let secondOpened = false;
    const secondPromise = sessions.open(new BunCookieJar(request(cookie), [sessions.cookieName])).then((lease) => {
      secondOpened = true;
      return lease;
    });
    await Promise.resolve();
    expect(secondOpened).toBe(false);
    await first.commit(new Response());
    const second = await secondPromise;
    expect(secondOpened).toBe(true);
    await second.commit(new Response());
  });

  it("does not serialize unrelated new sessions and rotates CSRF with session identity", async () => {
    const sessions = await manager();
    const [first, second] = await Promise.all([
      sessions.open(new BunCookieJar(request(), [sessions.cookieName])),
      sessions.open(new BunCookieJar(request(), [sessions.cookieName])),
    ]);
    expect(first.session.id).not.toBe(second.session.id);
    const csrf = new CsrfManager(sessions).context(first.session);
    const token = await csrf.token();
    expect(await csrf.rotate()).not.toBe(token);
    expect(await csrf.token()).not.toBe(token);
    first.release(); second.release();
  });

  it("invalidates to an empty rotated session and destroys terminally", async () => {
    const sessions = await manager();
    const first = await sessions.open(new BunCookieJar(request(), [sessions.cookieName]));
    first.session.put("value", "kept").invalidate();
    expect(first.session.get("value")).toBeUndefined();
    await first.commit(new Response());

    const doomed = await sessions.open(new BunCookieJar(request(), [sessions.cookieName]));
    doomed.session.destroy();
    const response = await doomed.commit(new Response());
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
    expect(() => doomed.session.get("value")).toThrow(/destroyed/i);
  });
});
