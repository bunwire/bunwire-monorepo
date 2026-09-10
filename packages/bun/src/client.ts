import {
  BUN_PAGE_LOCATION_HEADER,
  BUN_PAGE_REQUEST_HEADER,
  BUN_PAGE_RESPONSE_HEADER,
  BUN_PAGE_VERSION_HEADER,
  type BunwirePage,
} from "./page-protocol.js";

export interface BunPageComponentModule<Component = unknown> {
  readonly default: Component;
}

export type BunPageComponentResolver<Component = unknown> = (
  name: string,
) => Component | BunPageComponentModule<Component> | Promise<Component | BunPageComponentModule<Component>>;

export interface BunPageRenderContext<Component = unknown> {
  readonly page: BunwirePage;
  readonly component: Component;
}

export interface BunPageVisitOptions {
  readonly method?: string;
  readonly body?: BodyInit | null;
  readonly headers?: HeadersInit;
  readonly replace?: boolean;
  readonly preserveScroll?: boolean;
}

export interface BunPageClientOptions<Component = unknown> {
  readonly initialPage: BunwirePage;
  readonly resolvePage: BunPageComponentResolver<Component>;
  readonly render: (context: BunPageRenderContext<Component>) => void | Promise<void>;
  readonly window?: Window;
  readonly document?: Document;
  readonly fetch?: typeof fetch;
}

export type BunPageClientListener = () => void;

export class BunPageClientError extends Error {
  override readonly name = "BunPageClientError";
}

function moduleValue<Component>(value: Component | BunPageComponentModule<Component>): Component {
  return value && typeof value === "object" && "default" in value
    ? (value as BunPageComponentModule<Component>).default
    : value as Component;
}

function assertPage(value: unknown): asserts value is BunwirePage {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BunPageClientError("Bun page response must be an object.");
  const candidate = value as Partial<BunwirePage>;
  if (typeof candidate.component !== "string" || !candidate.props || typeof candidate.props !== "object"
    || Array.isArray(candidate.props) || typeof candidate.url !== "string"
    || (candidate.version !== undefined && typeof candidate.version !== "string")) {
    throw new BunPageClientError("Bun page response is malformed.");
  }
}

export function readInitialBunwirePage(document: Document, elementId = "bunwire-page"): BunwirePage {
  const element = document.getElementById(elementId);
  if (!element?.textContent) throw new BunPageClientError(`Missing initial Bun page element #${elementId}.`);
  let value: unknown;
  try { value = JSON.parse(element.textContent); }
  catch (cause) { throw new BunPageClientError(`Initial Bun page payload is invalid JSON: ${cause instanceof Error ? cause.message : String(cause)}`); }
  assertPage(value);
  return Object.freeze({ ...value, props: Object.freeze({ ...value.props }) });
}

export class BunPageClient<Component = unknown> {
  #page: BunwirePage;
  #component: Component | undefined;
  readonly #resolvePage: BunPageComponentResolver<Component>;
  readonly #render: BunPageClientOptions<Component>["render"];
  readonly #window: Window;
  readonly #document: Document;
  readonly #fetch: typeof fetch;
  readonly #listeners = new Set<BunPageClientListener>();
  #started = false;

  constructor(options: BunPageClientOptions<Component>) {
    if (!options || typeof options !== "object" || typeof options.resolvePage !== "function" || typeof options.render !== "function") {
      throw new BunPageClientError("Bun page client requires resolvePage and render callbacks.");
    }
    assertPage(options.initialPage);
    const browserWindow = options.window ?? globalThis.window;
    const browserDocument = options.document ?? globalThis.document;
    if (!browserWindow || !browserDocument) throw new BunPageClientError("Bun page client requires a browser window and document.");
    this.#page = Object.freeze({ ...options.initialPage, props: Object.freeze({ ...options.initialPage.props }) });
    this.#resolvePage = options.resolvePage;
    this.#render = options.render;
    this.#window = browserWindow;
    this.#document = browserDocument;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  get page(): BunwirePage { return this.#page; }
  get component(): Component | undefined { return this.#component; }
  subscribe(listener: BunPageClientListener): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }

  async start(): Promise<void> {
    if (this.#started) throw new BunPageClientError("Bun page client has already started.");
    this.#started = true;
    this.#document.addEventListener("click", this.#click);
    this.#window.addEventListener("popstate", this.#popstate);
    await this.#commit(this.#page, true, true);
  }

  stop(): void {
    if (!this.#started) return;
    this.#started = false;
    this.#document.removeEventListener("click", this.#click);
    this.#window.removeEventListener("popstate", this.#popstate);
  }

  async visit(url: string | URL, options: BunPageVisitOptions = {}): Promise<void> {
    const target = new URL(url, this.#window.location.href);
    if (target.origin !== this.#window.location.origin) { this.#window.location.assign(target.href); return; }
    const method = (options.method ?? "GET").toUpperCase();
    const headers = new Headers(options.headers);
    headers.set(BUN_PAGE_REQUEST_HEADER, "true");
    if (this.#page.version) headers.set(BUN_PAGE_VERSION_HEADER, this.#page.version);
    const response = await this.#fetch(target.href, { method, headers, body: method === "GET" || method === "HEAD" ? null : options.body ?? null, redirect: "follow" });
    if (response.status === 409) {
      const location = response.headers.get(BUN_PAGE_LOCATION_HEADER);
      if (!location) throw new BunPageClientError("Bun page version mismatch response is missing its location.");
      this.#window.location.assign(location);
      return;
    }
    if (!response.ok || response.headers.get(BUN_PAGE_RESPONSE_HEADER)?.toLowerCase() !== "true") {
      throw new BunPageClientError(`Bun page navigation failed with HTTP ${response.status}.`);
    }
    const value: unknown = await response.json();
    assertPage(value);
    await this.#commit(value, options.replace ?? false, options.preserveScroll ?? false);
  }

  async #commit(page: BunwirePage, replace: boolean, preserveScroll: boolean): Promise<void> {
    const resolved = await this.#resolvePage(page.component);
    const component = moduleValue(resolved);
    if (component === undefined || component === null) throw new BunPageClientError(`Unable to resolve Bun page component ${JSON.stringify(page.component)}.`);
    this.#page = Object.freeze({ ...page, props: Object.freeze({ ...page.props }) });
    this.#component = component;
    if (this.#window.location.pathname + this.#window.location.search !== page.url) {
      (replace ? this.#window.history.replaceState : this.#window.history.pushState).call(this.#window.history, { bunwire: true }, "", page.url);
    }
    if (!preserveScroll) this.#window.scrollTo(0, 0);
    await this.#render(Object.freeze({ page: this.#page, component }));
    for (const listener of this.#listeners) listener();
  }

  readonly #click = (event: MouseEvent): void => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(target instanceof HTMLAnchorElement) || target.target || target.hasAttribute("download") || target.dataset.bunwire === "false") return;
    const url = new URL(target.href, this.#window.location.href);
    if (url.origin !== this.#window.location.origin) return;
    event.preventDefault();
    void this.visit(url).catch((error) => { setTimeout(() => { throw error; }); });
  };

  readonly #popstate = (): void => {
    void this.visit(this.#window.location.href, { replace: true, preserveScroll: true }).catch((error) => { setTimeout(() => { throw error; }); });
  };
}

export function createBunwirePageClient<Component = unknown>(
  options: BunPageClientOptions<Component>,
): BunPageClient<Component> {
  return new BunPageClient(options);
}

export type {
  BunPageJsonValue,
  BunPageProps,
  BunwirePage,
} from "./page-protocol.js";
export {
  BUN_PAGE_LOCATION_HEADER,
  BUN_PAGE_REQUEST_HEADER,
  BUN_PAGE_RESPONSE_HEADER,
  BUN_PAGE_VERSION_HEADER,
} from "./page-protocol.js";
