import { Middleware, createToken, type MiddlewareNext, type Token } from "@bunwire/core";
import { BunAuthorizationException } from "./exceptions.js";
import type { BunHttpMethod } from "./http.js";
import type { BunMiddlewareContext } from "./middleware.js";

const SIGNATURE = "bw_signature";
const EXPIRES = "bw_expires";
const BASE = "http://bunwire.invalid";
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);

export interface BunSignedUrlOptions {
  readonly secret: string;
  readonly origin?: string;
}

export interface BunSignUrlOptions {
  readonly method?: BunHttpMethod;
  readonly expiresInSeconds?: number;
  readonly absolute?: boolean;
}

export interface BunSignedUrls {
  sign(path: string, options?: BunSignUrlOptions): Promise<string>;
  verify(request: Request): Promise<boolean>;
}

export class BunSignedUrlError extends Error {
  override readonly name = "BunSignedUrlError";
}

export const BUN_SIGNED_URLS: Token<BunSignedUrls> = createToken<BunSignedUrls>("bunwire.bun.signed-urls");

export function validateBunSignedUrlOptions(options: BunSignedUrlOptions): void {
  if (!options || typeof options !== "object" || Array.isArray(options)
    || typeof options.secret !== "string" || new TextEncoder().encode(options.secret).byteLength < 32) {
    throw new BunSignedUrlError("Signed URLs require a secret containing at least 32 UTF-8 bytes.");
  }
  if (options.origin !== undefined) {
    let origin: URL;
    try { origin = new URL(options.origin); }
    catch { throw new BunSignedUrlError("Signed URL origin must be an absolute HTTP(S) origin."); }
    if (!(["http:", "https:"].includes(origin.protocol)) || origin.origin !== options.origin
      || origin.username || origin.password || origin.search || origin.hash) {
      throw new BunSignedUrlError("Signed URL origin must be an absolute HTTP(S) origin without path, credentials, query, or fragment.");
    }
  }
}

function relativeUrl(path: string): URL {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("#") || path.includes("\\")) {
    throw new BunSignedUrlError("Signed URL paths must be relative, root-based paths without fragments or backslashes.");
  }
  let url: URL;
  try { url = new URL(path, BASE); }
  catch { throw new BunSignedUrlError("Signed URL path is invalid."); }
  if (url.origin !== BASE || url.searchParams.has(SIGNATURE) || url.searchParams.has(EXPIRES)) {
    throw new BunSignedUrlError("Signed URL path cannot supply reserved signature or expiry parameters.");
  }
  return url;
}

function payload(method: string, url: URL): ArrayBuffer {
  const query = [...url.searchParams.entries()].filter(([name]) => name !== SIGNATURE);
  const encoded = new TextEncoder().encode(JSON.stringify(["bunwire.signed-url.v1", method, url.pathname, query]));
  const bytes = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(bytes).set(encoded);
  return bytes;
}

export class SignedUrlManager implements BunSignedUrls {
  readonly #key: CryptoKey;
  readonly #origin: string | undefined;

  private constructor(key: CryptoKey, origin?: string) {
    this.#key = key;
    this.#origin = origin;
    Object.freeze(this);
  }

  static async create(options: BunSignedUrlOptions): Promise<SignedUrlManager> {
    validateBunSignedUrlOptions(options);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(options.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    return new SignedUrlManager(key, options.origin);
  }

  async sign(path: string, options: BunSignUrlOptions = {}): Promise<string> {
    const url = relativeUrl(path);
    const method = options.method ?? "GET";
    if (!METHODS.has(method)) throw new BunSignedUrlError("Signed URL method must be a supported HTTP method.");
    if (options.absolute !== undefined && typeof options.absolute !== "boolean") throw new BunSignedUrlError("Signed URL absolute must be a boolean.");
    if (options.absolute && !this.#origin) throw new BunSignedUrlError("Absolute signed URLs require a configured origin.");
    if (options.expiresInSeconds !== undefined) {
      if (!Number.isSafeInteger(options.expiresInSeconds) || options.expiresInSeconds < 1) {
        throw new BunSignedUrlError("Signed URL expiresInSeconds must be a positive safe integer.");
      }
      const expires = Math.ceil(Date.now() / 1000) + options.expiresInSeconds;
      if (!Number.isSafeInteger(expires)) throw new BunSignedUrlError("Signed URL expiry exceeds the safe integer range.");
      url.searchParams.append(EXPIRES, String(expires));
    }
    const signature = await crypto.subtle.sign("HMAC", this.#key, payload(method, url));
    url.searchParams.append(SIGNATURE, Buffer.from(signature).toString("base64url"));
    const relative = `${url.pathname}${url.search}`;
    return options.absolute ? `${this.#origin}${relative}` : relative;
  }

  async verify(request: Request): Promise<boolean> {
    try {
      if (!METHODS.has(request.method)) return false;
      const url = new URL(request.url);
      const signatures = url.searchParams.getAll(SIGNATURE);
      const expiries = url.searchParams.getAll(EXPIRES);
      if (signatures.length !== 1 || expiries.length > 1 || !/^[A-Za-z0-9_-]{43}$/.test(signatures[0]!)) return false;
      if (expiries.length === 1) {
        if (!/^(0|[1-9][0-9]*)$/.test(expiries[0]!)) return false;
        const expires = Number(expiries[0]);
        if (!Number.isSafeInteger(expires) || expires <= Date.now() / 1000) return false;
      }
      const signature = Buffer.from(signatures[0]!, "base64url");
      if (signature.length !== 32) return false;
      return await crypto.subtle.verify("HMAC", this.#key, signature, payload(request.method, url));
    } catch { return false; }
  }
}

@Middleware()
export class SignedUrlMiddleware {
  async handle(context: BunMiddlewareContext, next: MiddlewareNext<Response>): Promise<Response> {
    if (!context.signedUrls) throw new BunSignedUrlError("The signed middleware requires configured signed URLs.");
    if (!await context.signedUrls.verify(context.request)) throw new BunAuthorizationException();
    return next();
  }
}
