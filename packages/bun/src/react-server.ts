import { createElement, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import type { BunPageComponentResolver, BunPageComponentModule } from "./client.js";
import type { BunwirePage } from "./page-protocol.js";
import { ReactPageContext } from "./react-context.js";

export async function renderBunwireReactPage(
  page: BunwirePage,
  resolvePage: BunPageComponentResolver<ComponentType<Record<string, unknown>>>,
): Promise<string> {
  const resolved = await resolvePage(page.component);
  const component = resolved && typeof resolved === "object" && "default" in resolved
    ? (resolved as BunPageComponentModule<ComponentType<Record<string, unknown>>>).default
    : resolved as ComponentType<Record<string, unknown>>;
  if (!component) throw new Error(`Unable to resolve Bun page component ${JSON.stringify(page.component)}.`);
  return renderToString(createElement(ReactPageContext.Provider, { value: { page } }, createElement(component, page.props)));
}
