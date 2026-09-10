import { createToken, type Token } from "@bunwire/core";
import type { BunHttpRequest } from "./http.js";

export type BunCookieSameSite = "strict" | "lax" | "none";

export interface BunCookieOptions {
  readonly domain?: string;
  readonly path?: string;
  readonly expires?: Date;
  readonly secure?: boolean;
  readonly sameSite?: BunCookieSameSite;
  readonly httpOnly?: boolean;
  readonly partitioned?: boolean;
  readonly maxAge?: number;
}

export class BunCookieError extends Error {
  override readonly name = "BunCookieError";
}

export const BUN_COOKIES: Token<BunCookieJar> =
  createToken<BunCookieJar>("bunwire.bun.cookies");

function assertName(name: string): void {
  if (typeof name !== "string" || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
    throw new BunCookieError("Cookie names must be non-empty valid HTTP token values.");
  }
}

function serializeCookie(name: string, value: string, options: BunCookieOptions): string {
  const native = (globalThis as { Bun?: typeof Bun }).Bun;
  if (native?.Cookie) return new native.Cookie(name, value, options).serialize();
  const parts = [`${name}=${value}`];
  if (options.domain) parts.push(`Domain=${options.domain}`);
  parts.push(`Path=${options.path ?? "/"}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.secure) parts.push("Secure");
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite[0]!.toUpperCase()}${options.sameSite.slice(1)}`);
  if (options.partitioned) parts.push("Partitioned");
  return parts.join("; ");
}

function parseCookieHeader(header: string | null): Map<string, string> {
  const values = new Map<string, string>();
  for (const part of header?.split(";") ?? []) {
    const boundary = part.indexOf("=");
    if (boundary <= 0) continue;
    const name = part.slice(0, boundary).trim();
    if (!values.has(name)) values.set(name, part.slice(boundary + 1).trim());
  }
  return values;
}

export class BunCookieJar {
  readonly #values: Map<string, string>;
  readonly #changes: string[] = [];
  readonly #reserved: ReadonlySet<string>;

  constructor(request: BunHttpRequest, reserved: readonly string[] = []) {
    const nativeCookies = request.cookies;
    this.#values = nativeCookies
      ? new Map(nativeCookies.entries())
      : parseCookieHeader(request.headers.get("cookie"));
    this.#reserved = new Set(reserved);
  }

  get(name: string): string | undefined {
    assertName(name);
    return this.#values.get(name);
  }

  has(name: string): boolean {
    return this.get(name) !== undefined;
  }

  set(name: string, value: string, options: BunCookieOptions = {}): this {
    this.assertWritable(name);
    if (typeof value !== "string") throw new BunCookieError("Cookie values must be strings.");
    this.#values.set(name, value);
    this.#changes.push(serializeCookie(name, value, options));
    return this;
  }

  delete(name: string, options: Pick<BunCookieOptions, "domain" | "path" | "secure" | "sameSite"> = {}): this {
    this.assertWritable(name);
    this.#values.delete(name);
    this.#changes.push(serializeCookie(name, "", { ...options, expires: new Date(0), maxAge: 0 }));
    return this;
  }

  apply(response: Response): Response {
    if (this.#changes.length === 0) return response;
    const headers = new Headers(response.headers);
    for (const value of this.#changes) headers.append("Set-Cookie", value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  setFrameworkCookie(name: string, value: string, options: BunCookieOptions): void {
    assertName(name);
    this.#values.set(name, value);
    this.#changes.push(serializeCookie(name, value, options));
  }

  deleteFrameworkCookie(name: string, options: BunCookieOptions): void {
    assertName(name);
    this.#values.delete(name);
    this.#changes.push(serializeCookie(name, "", { ...options, expires: new Date(0), maxAge: 0 }));
  }

  private assertWritable(name: string): void {
    assertName(name);
    if (this.#reserved.has(name)) {
      throw new BunCookieError(`Cookie ${JSON.stringify(name)} is reserved by Bunwire.`);
    }
  }
}
