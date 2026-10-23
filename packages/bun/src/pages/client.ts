import {
  BUN_PAGE_CAPABILITY_HEADER,
  BUN_PAGE_PARTIAL_COMPONENT_HEADER,
  BUN_PAGE_PARTIAL_PROPS_HEADER,
  BUN_PAGE_DEFERRED_PROPS_HEADER,
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
  /** Refresh only these props when the destination keeps the current component. */
  readonly only?: readonly string[];
}

export interface BunPageClientOptions<Component = unknown> {
  readonly initialPage: BunwirePage;
  readonly resolvePage: BunPageComponentResolver<Component>;
  readonly render: (context: BunPageRenderContext<Component>) => void | Promise<void>;
  readonly window?: Window;
  readonly document?: Document;
  readonly fetch?: typeof fetch;
  /** Request deferred props after a negotiated page navigation. */
  readonly deferred?: boolean;
  readonly onDeferredError?: (error: unknown, keys: readonly string[]) => void;
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
    || (candidate.version !== undefined && typeof candidate.version !== "string")
    || (candidate.partial !== undefined && (!Array.isArray(candidate.partial) || candidate.partial.some((key) => typeof key !== "string")))
    || (candidate.deferred !== undefined && (!Array.isArray(candidate.deferred) || candidate.deferred.some((key) => typeof key !== "string")))) {
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
  readonly #deferred: boolean;
  readonly #onDeferredError: ((error: unknown, keys: readonly string[]) => void) | undefined;
  readonly #listeners = new Set<BunPageClientListener>();
  #started = false;
  #generation = 0;
  #lifecycle = 0;
  #pending?: AbortController;
  #commitQueue: Promise<void> = Promise.resolve();

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
    this.#deferred = options.deferred ?? false;
    this.#onDeferredError = options.onDeferredError;
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
    this.#generation++;
    this.#lifecycle++;
    this.#pending?.abort();
    this.#document.removeEventListener("click", this.#click);
    this.#window.removeEventListener("popstate", this.#popstate);
  }

  async visit(url: string | URL, options: BunPageVisitOptions = {}): Promise<void> {
    const generation = ++this.#generation;
    this.#pending?.abort();
    const pending = new AbortController();
    this.#pending = pending;
    const target = new URL(url, this.#window.location.href);
    if (target.origin !== this.#window.location.origin) { this.#window.location.assign(target.href); return; }
    const method = (options.method ?? "GET").toUpperCase();
    if (options.only && (method !== "GET" || target.pathname + target.search !== this.#page.url)) {
      throw new BunPageClientError("Partial Bun page reloads require GET on the current page URL.");
    }
    const headers = new Headers(options.headers);
    headers.set(BUN_PAGE_REQUEST_HEADER, "true");
    if (this.#deferred || options.only) headers.set(BUN_PAGE_CAPABILITY_HEADER, "2");
    if (options.only) {
      if (!Array.isArray(options.only) || options.only.length === 0 || options.only.some((key) => typeof key !== "string" || !key)) {
        throw new BunPageClientError("Partial page props must be a non-empty array of names.");
      }
      headers.set(BUN_PAGE_PARTIAL_COMPONENT_HEADER, this.#page.component);
      headers.set(BUN_PAGE_PARTIAL_PROPS_HEADER, JSON.stringify(options.only));
    }
    if (this.#page.version) headers.set(BUN_PAGE_VERSION_HEADER, this.#page.version);
    const response = await this.#fetch(target.href, { method, headers, body: method === "GET" || method === "HEAD" ? null : options.body ?? null, redirect: "follow", signal: pending.signal });
    if (generation !== this.#generation || pending.signal.aborted) return;
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
    if (generation !== this.#generation || pending.signal.aborted) return;
    assertPage(value);
    if ((value.partial || value.deferred) && response.headers.get(BUN_PAGE_CAPABILITY_HEADER) !== "2") {
      throw new BunPageClientError("Advanced Bun page response was not negotiated.");
    }
    await this.#commit(value, options.replace ?? false, options.preserveScroll ?? false, generation);
    if (generation === this.#generation && this.#deferred && value.deferred?.length) {
      void this.#loadDeferred(value.deferred, generation, pending.signal);
    }
  }

  #commit(page: BunwirePage, replace: boolean, preserveScroll: boolean, generation = this.#generation): Promise<void> {
    const lifecycle = this.#lifecycle;
    const commit = this.#commitQueue.then(() => this.#performCommit(page, replace, preserveScroll, generation, lifecycle));
    this.#commitQueue = commit.catch(() => undefined);
    return commit;
  }

  async #performCommit(page: BunwirePage, replace: boolean, preserveScroll: boolean, generation: number, lifecycle: number): Promise<void> {
    if (generation !== this.#generation || lifecycle !== this.#lifecycle) return;
    const previous = this.#page;
    if (page.partial && (page.component !== previous.component || page.partial.some((key) => !(key in page.props)))) {
      throw new BunPageClientError("Partial Bun page response does not match the current component or selected props.");
    }
    const resolved = await this.#resolvePage(page.component);
    if (generation !== this.#generation || lifecycle !== this.#lifecycle) return;
    const component = moduleValue(resolved);
    if (component === undefined || component === null) throw new BunPageClientError(`Unable to resolve Bun page component ${JSON.stringify(page.component)}.`);
    this.#page = Object.freeze({ ...page, props: Object.freeze(page.partial ? { ...previous.props, ...page.props } : { ...page.props }) });
    this.#component = component;
    if (this.#window.location.pathname + this.#window.location.search !== page.url) {
      (replace ? this.#window.history.replaceState : this.#window.history.pushState).call(this.#window.history, { bunwire: true }, "", page.url);
    }
    if (!preserveScroll) this.#window.scrollTo(0, 0);
    try {
      await this.#render(Object.freeze({ page: this.#page, component }));
    } catch (error) {
      if (generation === this.#generation && lifecycle === this.#lifecycle) throw error;
      return;
    }
    if (!this.#started || lifecycle !== this.#lifecycle) return;
    for (const listener of this.#listeners) listener();
  }

  async #loadDeferred(keys: readonly string[], generation: number, signal: AbortSignal): Promise<void> {
    try {
      const headers = new Headers({
        [BUN_PAGE_REQUEST_HEADER]: "true",
        [BUN_PAGE_CAPABILITY_HEADER]: "2",
        [BUN_PAGE_PARTIAL_COMPONENT_HEADER]: this.#page.component,
        [BUN_PAGE_DEFERRED_PROPS_HEADER]: JSON.stringify(keys),
      });
      if (this.#page.version) headers.set(BUN_PAGE_VERSION_HEADER, this.#page.version);
      const response = await this.#fetch(new URL(this.#page.url, this.#window.location.href).href, { headers, signal });
      if (signal.aborted || generation !== this.#generation) return;
      if (response.status === 409) {
        const location = response.headers.get(BUN_PAGE_LOCATION_HEADER);
        if (location) { this.#window.location.assign(location); return; }
      }
      if (!response.ok || response.headers.get(BUN_PAGE_CAPABILITY_HEADER) !== "2") {
        throw new BunPageClientError(`Deferred Bun page request failed with HTTP ${response.status}.`);
      }
      const value: unknown = await response.json();
      if (signal.aborted || generation !== this.#generation) return;
      assertPage(value);
      if (!value.partial || value.component !== this.#page.component || value.url !== this.#page.url
        || keys.some((key) => !value.partial!.includes(key))) {
        throw new BunPageClientError("Deferred Bun page response does not match its navigation.");
      }
      await this.#commit(value, true, true, generation);
    } catch (error) {
      if (!signal.aborted && generation === this.#generation) {
        if (this.#onDeferredError) this.#onDeferredError(error, keys);
        else setTimeout(() => { throw error; });
      }
    }
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
  BUN_PAGE_CAPABILITY_HEADER,
  BUN_PAGE_PARTIAL_COMPONENT_HEADER,
  BUN_PAGE_PARTIAL_PROPS_HEADER,
  BUN_PAGE_DEFERRED_PROPS_HEADER,
  BUN_PAGE_REQUEST_HEADER,
  BUN_PAGE_RESPONSE_HEADER,
  BUN_PAGE_VERSION_HEADER,
} from "./page-protocol.js";
