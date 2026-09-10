import {
  createContext,
  createElement,
  useContext,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type ComponentType,
  type MouseEvent,
  type ReactElement,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  BunPageClient,
  createBunwirePageClient,
  readInitialBunwirePage,
  type BunPageClientOptions,
  type BunPageComponentResolver,
  type BunPageVisitOptions,
} from "./client.js";
import type { BunPageProps, BunwirePage } from "./page-protocol.js";

export type BunReactPageComponent = ComponentType<Record<string, unknown>>;

export interface BunwireReactAppOptions {
  readonly resolvePage: BunPageComponentResolver<BunReactPageComponent>;
  readonly initialPage?: BunwirePage;
  readonly element?: Element | string;
  readonly window?: Window;
  readonly document?: Document;
  readonly fetch?: typeof fetch;
}

export interface BunwireReactApp {
  readonly client: BunPageClient<BunReactPageComponent>;
  readonly root: Root;
  unmount(): void;
}

interface ReactPageContextValue {
  readonly client: BunPageClient<BunReactPageComponent>;
}

const ReactPageContext = createContext<ReactPageContextValue | undefined>(undefined);

function useClient(): BunPageClient<BunReactPageComponent> {
  const context = useContext(ReactPageContext);
  if (!context) throw new Error("Bunwire React page hooks must be used beneath createBunwireReactApp().");
  return context.client;
}

export function usePage<Props extends object = BunPageProps>(): BunwirePage<Props> {
  const client = useClient();
  return useSyncExternalStore(
    (listener) => client.subscribe(listener),
    () => client.page as BunwirePage<Props>,
    () => client.page as BunwirePage<Props>,
  );
}

export interface BunwireLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  readonly href: string;
  readonly visit?: BunPageVisitOptions;
}

export function Link({ href, visit, onClick, ...attributes }: BunwireLinkProps): ReactElement {
  const client = useClient();
  const click = (event: MouseEvent<HTMLAnchorElement>): void => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void client.visit(href, visit).catch((error) => { setTimeout(() => { throw error; }); });
  };
  return createElement("a", { ...attributes, href, onClick: click });
}

function PageHost({ client }: ReactPageContextValue): ReactElement | null {
  useSyncExternalStore(
    (listener) => client.subscribe(listener),
    () => client.page,
    () => client.page,
  );
  const Component = client.component;
  return Component ? createElement(Component, client.page.props) : null;
}

export async function createBunwireReactApp(options: BunwireReactAppOptions): Promise<BunwireReactApp> {
  const browserDocument = options.document ?? globalThis.document;
  if (!browserDocument) throw new Error("Bunwire React pages require a browser document.");
  const element = typeof options.element === "string"
    ? browserDocument.querySelector(options.element)
    : options.element ?? browserDocument.getElementById("app");
  if (!element) throw new Error("Bunwire React page mount element was not found.");
  const initialPage = options.initialPage ?? readInitialBunwirePage(browserDocument);
  const clientOptions: BunPageClientOptions<BunReactPageComponent> = {
    initialPage,
    resolvePage: options.resolvePage,
    render: () => undefined,
    ...(options.window ? { window: options.window } : {}),
    document: browserDocument,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  };
  const client = createBunwirePageClient(clientOptions);
  await client.start();
  const root = createRoot(element);
  root.render(createElement(
    ReactPageContext.Provider,
    { value: Object.freeze({ client }) },
    createElement(PageHost, { client }),
  ));
  return Object.freeze({
    client,
    root,
    unmount(): void { client.stop(); root.unmount(); },
  });
}

export type { BunPageProps, BunwirePage } from "./page-protocol.js";
