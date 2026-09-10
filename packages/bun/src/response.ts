import type { BunHttpContext } from "./http.js";

export type BunJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly BunJsonValue[]
  | { readonly [key: string]: BunJsonValue };

export type BunRedirectStatus = 301 | 302 | 303 | 307 | 308;

export interface BunHttpResponseResolver {
  resolve(
    value: unknown,
    context: BunHttpContext,
  ): Response | undefined | Promise<Response | undefined>;
}

const REDIRECT_STATUSES = new Set<BunRedirectStatus>([301, 302, 303, 307, 308]);

export class BunUnsupportedResponseError extends TypeError {
  override readonly name = "BunUnsupportedResponseError";

  constructor(value: unknown) {
    super(`Bun HTTP handlers must return a native Response, undefined, a JSON-compatible value, a redirect result, or a value handled by a registered response resolver; received ${describeValue(value)}.`);
  }
}

export class BunRedirectResult {
  readonly location: string;
  readonly status: BunRedirectStatus;

  constructor(location: string, status: BunRedirectStatus = 302) {
    if (typeof location !== "string" || location.trim().length === 0) {
      throw new TypeError("Bun HTTP redirect location must be a non-empty string.");
    }
    if (!REDIRECT_STATUSES.has(status)) {
      throw new TypeError("Bun HTTP redirect status must be one of 301, 302, 303, 307, or 308.");
    }
    this.location = location;
    this.status = status;
    Object.freeze(this);
  }
}

export function redirect(
  location: string,
  status: BunRedirectStatus = 302,
): BunRedirectResult {
  return new BunRedirectResult(location, status);
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array containing unsupported JSON values";
  if (typeof value === "object") {
    const constructor = Object.getPrototypeOf(value) === null
      ? undefined
      : (value as { constructor?: { name?: string } }).constructor;
    return constructor?.name ? `an instance of ${constructor.name}` : "an unsupported object";
  }
  return typeof value;
}

function isJsonValue(value: unknown, ancestors: Set<object>): value is BunJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index) || !isJsonValue(value[index], ancestors)) return false;
      }
      return true;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    if (Object.getOwnPropertySymbols(value).length > 0) return false;
    return Object.values(value).every((entry) => isJsonValue(entry, ancestors));
  } finally {
    ancestors.delete(value);
  }
}

function jsonResponse(value: BunJsonValue): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function resolveBunHttpResponse(
  value: unknown,
  context: BunHttpContext,
  resolvers: readonly BunHttpResponseResolver[],
): Promise<Response> {
  if (value instanceof Response) return value;
  if (value instanceof BunRedirectResult) {
    return new Response(null, {
      status: value.status,
      headers: { Location: value.location },
    });
  }
  for (const resolver of resolvers) {
    const response = await resolver.resolve(value, context);
    if (response === undefined) continue;
    if (!(response instanceof Response)) throw new BunUnsupportedResponseError(response);
    return response;
  }
  if (value === undefined) return new Response(null, { status: 204 });
  if (isJsonValue(value, new Set())) return jsonResponse(value);
  throw new BunUnsupportedResponseError(value);
}
