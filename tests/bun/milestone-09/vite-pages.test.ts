import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createServer } from "vite";
import { bunwire, generateBunwirePageModule, loadBunwireConfig, renderBunwirePageManifest } from "@bunwire/vite";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Bun Milestone 9 — Vite page bridge", () => {
  it("loads and contains declarative page configuration", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bunwire-page-config-"));
    await mkdir(path.join(root, "src/backend"), { recursive: true });
    await mkdir(path.join(root, "src/pages"), { recursive: true });
    await writeFile(path.join(root, "src/bootstrap.ts"), "export default {};\n");
    await writeFile(path.join(root, "src/client.tsx"), "export {};\n");
    await writeFile(path.join(root, "bunwire.config.ts"), 'export default { source: "./src/backend", bootstrap: "./src/bootstrap.ts", pages: { root: "./src/pages", entry: "./src/client.tsx", devServer: "http://127.0.0.1:5173", extensions: [".tsx"] } };\n');
    const config = await loadBunwireConfig({ root });
    expect(config.pages).toEqual({
      root: path.join(root, "src/pages"), entry: path.join(root, "src/client.tsx"),
      devServer: "http://127.0.0.1:5173", extensions: [".tsx"],
    });
  });

  it("generates deterministic nested lazy page resolution and a development manifest", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bunwire-pages-"));
    await mkdir(path.join(root, "src/pages/Admin"), { recursive: true });
    await writeFile(path.join(root, "src/pages/Home.tsx"), "export default function Home() {}\n");
    await writeFile(path.join(root, "src/pages/Admin/Users.tsx"), "export default function Users() {}\n");
    await writeFile(path.join(root, "src/client.tsx"), "export {};\n");
    const generated = await generateBunwirePageModule({
      root, configFile: path.join(root, "bunwire.config.ts"), sourceRoots: [], bootstrap: path.join(root, "bootstrap.ts"),
      pages: { root: path.join(root, "src/pages"), entry: path.join(root, "src/client.tsx"), devServer: "http://localhost:5173", extensions: [".tsx"] },
    });
    expect(generated?.pages.map(({ name }) => name)).toEqual(["Admin/Users", "Home"]);
    expect(generated?.code).toContain('"Admin/Users": () => import("/src/pages/Admin/Users.tsx")');
    expect(generated?.manifestCode).toContain('"mode": "development"');
    expect(generated?.manifestCode).toContain("http://localhost:5173/src/client.tsx");
    expect((await generateBunwirePageModule({
      root, configFile: "", sourceRoots: [], bootstrap: "",
      pages: { root: path.join(root, "src/pages"), entry: path.join(root, "src/client.tsx"), devServer: "http://localhost:5173", extensions: [".tsx"] },
    }))?.hash).toBe(generated?.hash);
  });

  it("renders a server-consumable production manifest", () => {
    const code = renderBunwirePageManifest({
      protocol: 1, mode: "production", components: ["Home"], entry: "/assets/app.js",
      styles: ["/assets/app.css"], version: "hash", assetRoot: "dist/client",
      assets: ["/assets/app.css", "/assets/app.js"],
    });
    expect(code).toContain('"version": "hash"');
    expect(code).toContain('"assetRoot": "dist/client"');
  });

  it("serves the lazy page resolver from a real Vite development server without a production build", async () => {
    const root = path.join(repositoryRoot, "examples/bun-app");
    const server = await createServer({
      root, configFile: false, appType: "custom",
      resolve: { alias: {
        "@bunwire/core": path.join(repositoryRoot, "packages/core/src/index.ts"),
        "@bunwire/bun": path.join(repositoryRoot, "packages/bun/src/index.ts"),
      } },
      plugins: [bunwire({ root })], server: { middlewareMode: true },
    });
    try {
      const transformed = await server.transformRequest("virtual:bunwire/pages");
      expect(transformed?.code).toContain("Dashboard");
      expect(transformed?.code).toContain("Home");
      expect(transformed?.code).toContain("import(");
    } finally { await server.close(); }
  });

  it("invalidates the virtual page catalog when development pages are added", async () => {
    const output = path.join(repositoryRoot, "output");
    await mkdir(output, { recursive: true });
    const root = await mkdtemp(path.join(output, "bunwire-page-hmr-"));
    await mkdir(path.join(root, "src/backend"), { recursive: true });
    await mkdir(path.join(root, "src/pages"), { recursive: true });
    await writeFile(path.join(root, "src/bootstrap.ts"), 'import { BunAdapter } from "@bunwire/bun"; import { defineApp } from "@bunwire/core"; export default defineApp().withAdapter(new BunAdapter());\n');
    await writeFile(path.join(root, "src/backend/controller.ts"), 'import { Get } from "@bunwire/bun"; import { Controller } from "@bunwire/core"; @Controller() export class C { @Get() get() { return new Response(); } }\n');
    await writeFile(path.join(root, "src/pages/Home.ts"), "export default function Home() {}\n");
    await writeFile(path.join(root, "src/client.ts"), "export {};\n");
    await writeFile(path.join(root, "bunwire.config.ts"), 'export default { source: "./src/backend", bootstrap: "./src/bootstrap.ts", pages: { root: "./src/pages", entry: "./src/client.ts" } };\n');
    let server: Awaited<ReturnType<typeof createServer>> | undefined;
    try {
      const plugin = bunwire({ root });
      server = await createServer({ root, configFile: false, appType: "custom", plugins: [plugin], server: { middlewareMode: true } });
      expect((await server.transformRequest("virtual:bunwire/pages"))?.code).toContain("Home");
      const addedPath = path.join(root, "src/pages/Added.ts");
      await writeFile(addedPath, "export default function Added() {}\n");
      await (plugin.handleHotUpdate as unknown as (context: unknown) => Promise<unknown>)({
        file: addedPath, server, modules: [],
      });
      const deadline = Date.now() + 10_000;
      let updated = false;
      while (Date.now() < deadline) {
        if ((await server.transformRequest("virtual:bunwire/pages"))?.code.includes("Added")) { updated = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(updated).toBe(true);
    } finally {
      await server?.close();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); break; }
        catch (error) { if (attempt === 9) throw error; await new Promise((resolve) => setTimeout(resolve, 100)); }
      }
    }
  }, 20_000);
});
