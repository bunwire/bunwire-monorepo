import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { build } from "vite";
import { bunwire } from "@bunwire/vite";
import { createBunPageServerRenderer, withBunPageServerManifest, type BunHttpContext, type BunPageManifest, type BunPageServerManifest } from "@bunwire/bun";

describe("Bun Milestone 22 — Vite SSR manifest", () => {
  it("keeps browser and server bundles separate and resolves the server entry", async () => {
    const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../output");
    await mkdir(output, { recursive: true });
    const root = await mkdtemp(path.join(output, "bunwire-page-ssr-"));
    try {
      await mkdir(path.join(root, "src/pages"), { recursive: true });
      await writeFile(path.join(root, "bunwire.config.ts"),
        'export default { source: "./src", bootstrap: "./src/bootstrap.ts", pages: { root: "./src/pages", entry: "./src/client.ts", ssrEntry: "./src/server.ts" } };\n');
      await writeFile(path.join(root, "src/bootstrap.ts"), 'import { BunAdapter } from "@bunwire/bun"; import { defineApp } from "@bunwire/core"; export default defineApp().withAdapter(new BunAdapter());\n');
      await writeFile(path.join(root, "src/pages/Home.ts"), 'import { createElement } from "react"; export default function Home() { return createElement("h1", null, "Home"); }\n');
      await writeFile(path.join(root, "src/client.ts"), 'import resolvePage from "virtual:bunwire/pages"; void resolvePage;\n');
      await writeFile(path.join(root, "src/server.ts"), 'import { renderBunwireReactPage } from "@bunwire/bun/react/server"; import resolvePage from "virtual:bunwire/pages"; export function renderPage(page) { return renderBunwireReactPage(page, resolvePage); }\n');
      await build({ root, configFile: false, logLevel: "silent", plugins: [bunwire({ root })],
        build: { outDir: "dist/client", emptyOutDir: true, rollupOptions: { input: path.join(root, "src/client.ts") } },
      });
      await build({ root, configFile: false, logLevel: "silent", plugins: [bunwire({ root })],
        build: { ssr: path.join(root, "src/server.ts"), outDir: "dist/server", emptyOutDir: true },
      });
      const browser = JSON.parse(await readFile(path.join(root, "dist/client/bunwire-pages.json"), "utf8")) as BunPageManifest;
      const serverFiles = await readdir(path.join(root, "dist/server"));
      expect(serverFiles).toContain("bunwire-pages-server.json");
      const server = JSON.parse(await readFile(path.join(root, "dist/server/bunwire-pages-server.json"), "utf8")) as BunPageServerManifest;
      expect(browser.entry).toMatch(/^\//);
      expect(browser.assets).not.toContain(server.serverEntry);
      const combined = withBunPageServerManifest(browser, server);
      expect(combined.serverEntry).toBe(server.serverEntry);
      const source = await readFile(server.serverEntry, "utf8");
      expect(source).toContain("renderPage");
      const rendered = await createBunPageServerRenderer(combined)(
        { component: "Home", props: {}, url: "/" }, combined,
        { request: new Request("http://example.test/") } as BunHttpContext,
      );
      expect(rendered).toBe("<h1>Home</h1>");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
