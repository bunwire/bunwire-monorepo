import { BunAdapter, MemoryQueueDriver, SyncQueueDriver, createBunPageServerRenderer,
  createSessionAuthGuard, withBunPageServerManifest, type BunPageServerManifest } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { resolveExamplePrincipal, type ExamplePrincipal } from "./auth.js";
import pageManifest from "../.bunwire/pages.js";
import { actionCodec } from "./events.js";

const ssr = process.env.BUNWIRE_EXAMPLE_SSR === "1";
const pages = ssr ? withBunPageServerManifest(pageManifest,
  JSON.parse(await readFile(resolve(process.cwd(), "dist/server/bunwire-pages-server.json"), "utf8")) as BunPageServerManifest)
  : pageManifest;

export default defineApp()
  .withAdapter(new BunAdapter<ExamplePrincipal>({
    role: process.env.BUNWIRE_EXAMPLE_ROLE === "command" ? "command" : "http",
    queues: { driver: process.env.BUNWIRE_EXAMPLE_INTEGRATED === "1" ? new MemoryQueueDriver() : new SyncQueueDriver(), eventCodecs: [actionCodec] },
    http: {
      ...(process.env.BUNWIRE_EXAMPLE_PORT === undefined ? {} : { port: Number(process.env.BUNWIRE_EXAMPLE_PORT) }),
      onServer(server) { if (process.env.BUNWIRE_EXAMPLE_INTEGRATED === "1") console.log(`BUNWIRE_EXAMPLE_READY ${server.url}`); },
      sessions: {
        secret: process.env.BUNWIRE_SESSION_SECRET ?? "bunwire-example-development-secret",
        cookie: { secure: false },
      },
      auth: {
        defaultGuard: "session",
        guards: [createSessionAuthGuard({
          identify: (principal: ExamplePrincipal) => principal.id,
          resolve: resolveExamplePrincipal,
        })],
      },
      authorization: {
        abilities: {
          "dashboard.view": ({ principal }) => principal?.role === "admin",
        },
        policies: [{
          name: "post",
          resolve: (id) => ({ id, owner: "example-user" }),
          abilities: {
            view: ({ principal, resource }) => principal?.id === resource.owner,
          },
        }],
      },
      signedUrls: { secret: process.env.BUNWIRE_EXAMPLE_URL_SECRET ?? "bunwire-example-local-signing-secret-2026" },
      pagination: { defaultPageSize: 2, maxPageSize: 10 },
      rateLimiting: { policies: [{ name: "v2-report", limit: 2, windowMs: 60_000,
        onBackendError: "closed", key: ({ auth }) => auth?.principal ? `user:${auth.principal.id}` : "guest" }] },
      health: {},
      maintenance: { retryAfterSeconds: 15,
        authorizeBypass(request) { const key = process.env.BUNWIRE_EXAMPLE_OPERATOR_KEY;
          return key !== undefined && key.length > 0 && request.headers.get("X-Example-Operator-Key") === key; } },
      pages: {
        manifest: pages,
        ...(ssr ? { ssr: createBunPageServerRenderer(pages) } : {}),
        flash: { notice: "notice" },
        shared: async ({ auth, http }) => ({
          auth: { principal: auth?.principal ?? null },
          csrfToken: http.csrf ? await http.csrf.token() : null,
        }),
      },
      websocket: {
        mapIdentity(context) { return context.auth?.principal ? { userId: context.auth.principal.id } : undefined; },
        authorizeChannel({ channel, identity }) {
          return typeof identity === "object" && identity !== null && !Array.isArray(identity)
            && typeof (identity as { userId?: unknown }).userId === "string"
            && channel === `user:${(identity as { userId: string }).userId}`;
        },
      },
    },
  }))
  .withMiddlewares((middleware) => {
    middleware.group("web", ["example-http:example"]);
    middleware.use("web");
  });
