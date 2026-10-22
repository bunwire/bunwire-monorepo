import {
  BunHttpException,
  BunPaginationContext,
  BunPaginationError,
  BunSignedUrlError,
  SignedUrlManager,
} from "@bunwire/bun";
import { describe, expect, it, vi } from "vitest";

const secret = "0123456789abcdef0123456789abcdef";

function request(path: string, method = "GET"): Request {
  return new Request(`https://example.test${path}`, { method });
}

describe("Bun Milestone 18 — signed URLs", () => {
  it("binds method, path, and ordered query pairs while normalizing encoding", async () => {
    const manager = await SignedUrlManager.create({ secret });
    const signed = await manager.sign("/files/a?tag=one&tag=two&name=two%20words", { method: "POST" });
    expect(signed).toMatch(/^\/files\/a\?/);
    expect(await manager.verify(request(signed, "POST"))).toBe(true);
    expect(await manager.verify(request(signed, "GET"))).toBe(false);
    expect(await manager.verify(request(signed.replace("/files/a", "/files/b"), "POST"))).toBe(false);
    expect(await manager.verify(request(signed.replace("tag=one&tag=two", "tag=two&tag=one"), "POST"))).toBe(false);
    expect(await manager.verify(request(signed.replace("name=two+words", "name=two%20words"), "POST"))).toBe(true);
    expect(await manager.verify(request(`${signed}&bw_signature=extra`, "POST"))).toBe(false);
    expect(await manager.verify(request(signed.replace("tag=one", "tag=other"), "POST"))).toBe(false);
  });

  it("expires links, rejects malformed signatures, and invalidates old secrets", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    try {
      const manager = await SignedUrlManager.create({ secret });
      const signed = await manager.sign("/download", { expiresInSeconds: 10 });
      expect(await manager.verify(request(signed))).toBe(true);
      now.mockReturnValue(1_012_000);
      expect(await manager.verify(request(signed))).toBe(false);
      expect(await manager.verify(request(signed.replace(/bw_signature=[^&]+/, "bw_signature=bad")))).toBe(false);
      expect(await manager.verify(request(`${signed}&bw_expires=9999999`))).toBe(false);
      const replacement = await SignedUrlManager.create({ secret: "abcdef0123456789abcdef0123456789" });
      expect(await replacement.verify(request(await manager.sign("/download")))).toBe(false);
    } finally { now.mockRestore(); }
  });

  it("uses only a configured trusted origin for absolute output", async () => {
    const relative = await SignedUrlManager.create({ secret });
    await expect(relative.sign("/report", { absolute: true })).rejects.toBeInstanceOf(BunSignedUrlError);
    const absolute = await SignedUrlManager.create({ secret, origin: "https://public.test" });
    expect(await absolute.sign("/report", { absolute: true })).toMatch(/^https:\/\/public\.test\/report\?/);
    await expect(SignedUrlManager.create({ secret, origin: "https://public.test/path" })).rejects.toBeInstanceOf(BunSignedUrlError);
    await expect(relative.sign("//host.test/report")).rejects.toBeInstanceOf(BunSignedUrlError);
    await expect(relative.sign("/report?bw_signature=fake")).rejects.toBeInstanceOf(BunSignedUrlError);
  });
});

describe("Bun Milestone 18 — pagination", () => {
  it("returns bounded input and relative links while retaining repeated filters", () => {
    const pagination = new BunPaginationContext(request("/items?tag=a&tag=b&page=2&perPage=3"));
    expect(pagination.input()).toEqual({ page: 2, pageSize: 3, offset: 3 });
    const result = pagination.result(["d", "e", "f"], 8);
    expect(result).toMatchObject({ page: 2, pageSize: 3, offset: 3, total: 8, pageCount: 3 });
    expect(result.links.self).toBe("/items?tag=a&tag=b&page=2&perPage=3");
    expect(result.links.previous).toBe("/items?tag=a&tag=b&page=1&perPage=3");
    expect(result.links.next).toBe("/items?tag=a&tag=b&page=3&perPage=3");
    expect(result.links.last).toBe(result.links.next);
    expect(Object.isFrozen(result.items)).toBe(true);
  });

  it("rejects malformed, duplicate, unsafe, and oversized pagination input", () => {
    for (const path of ["?page=0", "?page=-1", "?page=01", "?page=1&page=2", "?perPage=101", "?perPage=1.5", "?page=9007199254740992", "?page=9007199254740991&perPage=100"]) {
      expect(() => new BunPaginationContext(request(`/items${path}`)).input()).toThrow(BunHttpException);
    }
    expect(() => new BunPaginationContext(request("/items"), { defaultPageSize: 50, maxPageSize: 10 })).toThrow(BunPaginationError);
    expect(() => new BunPaginationContext(request("/items")).result([], -1)).toThrow(BunPaginationError);
  });

  it("uses defaults and handles empty totals without inventing an absolute host", () => {
    const pagination = new BunPaginationContext(request("/items?filter=active"));
    expect(pagination.input()).toEqual({ page: 1, pageSize: 20, offset: 0 });
    const result = pagination.result([], 0);
    expect(result.pageCount).toBe(0);
    expect(result.links).toEqual({
      self: "/items?filter=active&page=1&perPage=20",
      first: "/items?filter=active&page=1&perPage=20",
      last: "/items?filter=active&page=1&perPage=20",
    });
  });
});
