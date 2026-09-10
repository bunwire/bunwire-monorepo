import { createToken, type Token } from "@bunwire/core";
import type { BunAuthContext } from "./auth.js";
import { BunValidationException } from "./exceptions.js";
import type { BunHttpContext } from "./http.js";
import {
  BUN_PAGE_LOCATION_HEADER,
  BUN_PAGE_PROTOCOL_VERSION,
  BUN_PAGE_REQUEST_HEADER,
  BUN_PAGE_RESPONSE_HEADER,
  BUN_PAGE_VERSION_HEADER,
  type BunPageJsonValue,
  type BunPageManifest,
  type BunPageProps,
  type BunwirePage,
} from "./page-protocol.js";
import {
  BUN_SESSION_FRAMEWORK_DELETE,
  BUN_SESSION_FRAMEWORK_GET,
  BUN_SESSION_FRAMEWORK_SET,
  type BunSessionValue,
  type Session,
} from "./sessions.js";

export interface BunPageSharedPropsContext<Principal = unknown> {
  readonly http: BunHttpContext<Principal>;
  readonly auth?: BunAuthContext<Principal>;
  readonly session?: Session;
}

export type BunPageSharedPropsResolver<Principal = unknown> = (
  context: BunPageSharedPropsContext<Principal>,
) => Readonly<Record<string, unknown>> | Promise<Readonly<Record<string, unknown>>>;

export type BunPageShellRenderer = (
  page: BunwirePage,
  manifest: BunPageManifest,
) => string | Promise<string>;

export interface BunPageOptions<Principal = unknown> {
  readonly manifest: BunPageManifest;
  readonly shared?: BunPageSharedPropsResolver<Principal> | readonly BunPageSharedPropsResolver<Principal>[];
  readonly flash?: Readonly<Record<string, string>>;
  readonly shell?: BunPageShellRenderer;
}

interface BunPageFlashState {
  readonly errors: Readonly<Record<string, readonly string[]>>;
  readonly old: Readonly<Record<string, BunSessionValue>>;
}

const PAGE_FLASH_KEY = "bunwire.pages.validation";

export class BunPageError extends Error {
  override readonly name: string = "BunPageError";
}

export class BunPageComponentError extends BunPageError {
  override readonly name = "BunPageComponentError";
}

export class BunPageResult<Props extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>> {
  readonly component: string;
  readonly props: Props;

  constructor(component: string, props: Props) {
    if (typeof component !== "string" || component.trim().length === 0) {
      throw new BunPageError("Bun page component must be a non-empty string.");
    }
    if (!props || typeof props !== "object" || Array.isArray(props)) {
      throw new BunPageError("Bun page props must be an object.");
    }
    this.component = component;
    this.props = Object.freeze({ ...props });
    Object.freeze(this);
  }
}

export function page<Properties extends Readonly<Record<string, unknown>> = Readonly<Record<string, never>>>(
  component: string,
  props: Properties = {} as Properties,
): BunPageResult<Properties> {
  return new BunPageResult(component, props);
}

export const BUN_PAGE_MANAGER: Token<BunPageManager<unknown>> =
  createToken<BunPageManager<unknown>>("bunwire.bun.page-manager");

function isPlainJson(value: unknown, ancestors = new Set<object>()): value is BunPageJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.every((entry) => isPlainJson(entry, ancestors));
    const prototype = Object.getPrototypeOf(value);
    return (prototype === Object.prototype || prototype === null)
      && Object.getOwnPropertySymbols(value).length === 0
      && Object.values(value).every((entry) => isPlainJson(entry, ancestors));
  } finally {
    ancestors.delete(value);
  }
}

function freezeJson(value: BunPageJsonValue): BunPageJsonValue {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeJson));
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeJson(item)])));
  }
  return value;
}

function props(value: unknown, label: string): BunPageProps {
  if (!value || typeof value !== "object" || Array.isArray(value) || !isPlainJson(value)) {
    throw new BunPageError(`${label} must be a JSON-compatible object.`);
  }
  return freezeJson(value as BunPageJsonValue) as BunPageProps;
}

function assertAsset(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || /[\r\n]/.test(value)) {
    throw new BunPageError(`${label} must be a non-empty asset URL without line breaks.`);
  }
  let parsed: URL;
  try { parsed = new URL(value, "http://bunwire.invalid"); }
  catch { throw new BunPageError(`${label} must be a valid URL or root-relative path.`); }
  if (!value.startsWith("/") && parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BunPageError(`${label} must use HTTP(S) or a root-relative path.`);
  }
}

export function validateBunPageManifest(value: BunPageManifest): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BunPageError("Bun page manifest must be an object.");
  if (value.protocol !== BUN_PAGE_PROTOCOL_VERSION) throw new BunPageError(`Bun page manifest protocol must be ${BUN_PAGE_PROTOCOL_VERSION}.`);
  if (value.mode !== "development" && value.mode !== "production") throw new BunPageError('Bun page manifest mode must be "development" or "production".');
  if (!Array.isArray(value.components) || value.components.length === 0
    || value.components.some((component) => typeof component !== "string" || component.length === 0)
    || new Set(value.components).size !== value.components.length) {
    throw new BunPageError("Bun page manifest components must be a non-empty array of unique names.");
  }
  assertAsset(value.entry, "Bun page manifest entry");
  if (value.styles !== undefined && (!Array.isArray(value.styles) || value.styles.some((style) => {
    try { assertAsset(style, "Bun page manifest style"); return false; } catch { return true; }
  }))) throw new BunPageError("Bun page manifest styles must contain valid asset URLs.");
  if (value.mode === "production" && (typeof value.version !== "string" || value.version.length === 0)) {
    throw new BunPageError("Production Bun page manifests require a non-empty version.");
  }
  if (value.mode === "production" && (typeof value.assetRoot !== "string" || value.assetRoot.length === 0
    || !Array.isArray(value.assets) || value.assets.length === 0
    || value.assets.some((asset) => typeof asset !== "string" || !asset.startsWith("/") || asset.includes("..")))) {
    throw new BunPageError("Production Bun page manifests require an asset root and root-relative asset list.");
  }
}

function escapeHtmlJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function defaultShell(current: BunwirePage, manifest: BunPageManifest): string {
  const styles = (manifest.styles ?? []).map((href) => `<link rel="stylesheet" href="${escapeAttribute(href)}">`).join("");
  const viteClient = manifest.mode === "development"
    ? `<script type="module" src="${escapeAttribute(new URL("/@vite/client", manifest.entry).href)}"></script>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="app"></div><script id="bunwire-page" type="application/json">${escapeHtmlJson(current)}</script>${viteClient}<script type="module" src="${escapeAttribute(manifest.entry)}"></script></body></html>`;
}

function appendVary(headers: Headers, value: string): void {
  const current = headers.get("Vary")?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [];
  if (!current.some((entry) => entry.toLowerCase() === value.toLowerCase())) current.push(value);
  headers.set("Vary", current.join(", "));
}

function isPageRequest(request: Request): boolean {
  return request.headers.get(BUN_PAGE_REQUEST_HEADER)?.toLowerCase() === "true";
}

function requestUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.pathname}${url.search}`;
}

function sameOriginReferer(request: Request): string {
  const source = new URL(request.url);
  const referer = request.headers.get("Referer");
  if (!referer) return requestUrl(request);
  try {
    const target = new URL(referer);
    return target.origin === source.origin ? `${target.pathname}${target.search}` : requestUrl(request);
  } catch { return requestUrl(request); }
}

function pageFlash(session: Session): BunPageFlashState | undefined {
  const value = session[BUN_SESSION_FRAMEWORK_GET]<BunSessionValue>(PAGE_FLASH_KEY);
  session[BUN_SESSION_FRAMEWORK_DELETE](PAGE_FLASH_KEY);
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as unknown as BunPageFlashState;
  return candidate.errors && candidate.old ? candidate : undefined;
}

export class BunPageManager<Principal = unknown> {
  readonly manifest: BunPageManifest;
  readonly #components: ReadonlySet<string>;
  readonly #shared: readonly BunPageSharedPropsResolver<Principal>[];
  readonly #flash: Readonly<Record<string, string>>;
  readonly #shell: BunPageShellRenderer;

  constructor(options: BunPageOptions<Principal>) {
    if (!options || typeof options !== "object" || Array.isArray(options)) throw new BunPageError("Bun page options must be an object.");
    validateBunPageManifest(options.manifest);
    const shared = options.shared === undefined ? [] : Array.isArray(options.shared) ? options.shared : [options.shared];
    if (shared.some((resolver) => typeof resolver !== "function")) throw new BunPageError("Every Bun shared-props resolver must be callable.");
    if (options.flash !== undefined && (!options.flash || typeof options.flash !== "object" || Array.isArray(options.flash)
      || Object.entries(options.flash).some(([property, key]) => property.length === 0 || typeof key !== "string" || key.length === 0))) {
      throw new BunPageError("Bun page flash mappings must map non-empty prop names to non-empty session keys.");
    }
    if (options.shell !== undefined && typeof options.shell !== "function") throw new BunPageError("Bun page shell must be callable.");
    this.manifest = Object.freeze({
      ...options.manifest,
      components: Object.freeze([...options.manifest.components]),
      ...(options.manifest.styles ? { styles: Object.freeze([...options.manifest.styles]) } : {}),
      ...(options.manifest.assets ? { assets: Object.freeze([...options.manifest.assets]) } : {}),
    });
    this.#components = new Set(this.manifest.components);
    this.#shared = Object.freeze([...shared]);
    this.#flash = Object.freeze({ ...(options.flash ?? {}) });
    this.#shell = options.shell ?? defaultShell;
  }

  async resolve(result: BunPageResult, context: BunHttpContext<Principal>): Promise<Response> {
    if (!this.#components.has(result.component)) throw new BunPageComponentError(`Unknown Bun page component ${JSON.stringify(result.component)}.`);
    let merged: Record<string, BunPageJsonValue> = {};
    const validation = context.session ? pageFlash(context.session) : undefined;
    if (validation) merged = { errors: props(validation.errors, "Bun page validation errors"), old: props(validation.old, "Bun page old input") };
    for (const resolver of this.#shared) {
      merged = { ...merged, ...props(await resolver(Object.freeze({
        http: context,
        ...(context.auth ? { auth: context.auth } : {}),
        ...(context.session ? { session: context.session } : {}),
      })), "Bun shared page props") };
    }
    if (context.session) {
      for (const [property, key] of Object.entries(this.#flash)) {
        const value = context.session.consumeFlash(key);
        if (value !== undefined) merged[property] = freezeJson(value);
      }
    }
    merged = { ...merged, ...props(result.props, "Bun controller page props") };
    const current = Object.freeze({
      component: result.component,
      props: Object.freeze(merged),
      url: requestUrl(context.request),
      ...(this.manifest.version ? { version: this.manifest.version } : {}),
    }) as BunwirePage;
    const navigation = isPageRequest(context.request);
    const requestedVersion = context.request.headers.get(BUN_PAGE_VERSION_HEADER);
    if (navigation && context.request.method === "GET" && this.manifest.version && requestedVersion && requestedVersion !== this.manifest.version) {
      return new Response(null, { status: 409, headers: { [BUN_PAGE_LOCATION_HEADER]: context.request.url, [BUN_PAGE_RESPONSE_HEADER]: "true", Vary: BUN_PAGE_REQUEST_HEADER } });
    }
    const headers = new Headers({ [BUN_PAGE_RESPONSE_HEADER]: "true" });
    if (this.manifest.version) headers.set(BUN_PAGE_VERSION_HEADER, this.manifest.version);
    appendVary(headers, BUN_PAGE_REQUEST_HEADER);
    if (navigation) {
      headers.set("Content-Type", "application/json; charset=utf-8");
      return new Response(JSON.stringify(current), { headers });
    }
    headers.set("Content-Type", "text/html; charset=utf-8");
    const shell = await this.#shell(current, this.manifest);
    if (typeof shell !== "string") throw new BunPageError("Bun page shell renderer must return a string.");
    return new Response(shell, { headers });
  }

  handleException(error: unknown, context: BunHttpContext<Principal>): Response | undefined {
    if (!(error instanceof BunValidationException) || !isPageRequest(context.request) || !context.session) return undefined;
    context.session[BUN_SESSION_FRAMEWORK_SET](PAGE_FLASH_KEY, {
      errors: error.errors,
      old: error.oldInput,
    });
    return new Response(null, { status: 303, headers: { Location: sameOriginReferer(context.request), [BUN_PAGE_RESPONSE_HEADER]: "true", Vary: BUN_PAGE_REQUEST_HEADER } });
  }

  finalize(response: Response, context: BunHttpContext<Principal>): Response {
    if (!isPageRequest(context.request)) return response;
    const headers = new Headers(response.headers);
    appendVary(headers, BUN_PAGE_REQUEST_HEADER);
    if (response.status >= 300 && response.status < 400) headers.set(BUN_PAGE_RESPONSE_HEADER, "true");
    const status = context.request.method !== "GET" && (response.status === 301 || response.status === 302)
      ? 303
      : response.status;
    if (status === response.status && [...headers].every(([name, value]) => response.headers.get(name) === value)) return response;
    return new Response(response.body, { status, statusText: response.statusText, headers });
  }

  asset(request: Request): Response | undefined {
    if (this.manifest.mode !== "production" || !this.manifest.assetRoot || !this.manifest.assets) return undefined;
    const pathname = new URL(request.url).pathname;
    if (!this.manifest.assets.includes(pathname)) return undefined;
    const file = Bun.file(`${this.manifest.assetRoot}/${pathname.slice(1)}`);
    return new Response(file);
  }
}
