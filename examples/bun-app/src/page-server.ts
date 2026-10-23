import { renderBunwireReactPage } from "@bunwire/bun/react/server";
import type { BunwirePage } from "@bunwire/bun";
import resolvePage from "virtual:bunwire/pages";

export function renderPage(page: BunwirePage): Promise<string> {
  return renderBunwireReactPage(page, resolvePage);
}
