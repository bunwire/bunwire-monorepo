import { BunAdapter, MemoryQueueDriver, SyncQueueDriver, createSessionAuthGuard } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";
import { resolveExamplePrincipal, type ExamplePrincipal } from "./auth.js";
import pageManifest from "../.bunwire/pages.js";
import { actionCodec } from "./events.js";

export default defineApp()
  .withAdapter(new BunAdapter<ExamplePrincipal>({
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
      pages: {
        manifest: pageManifest,
        flash: { notice: "notice" },
        shared: async ({ auth, http }) => ({
          auth: { principal: auth?.principal ?? null },
          csrfToken: http.csrf ? await http.csrf.token() : null,
        }),
      },
      websocket: {
        mapIdentity(context) { return context.auth?.principal ? { userId: context.auth.principal.id } : undefined; },
      },
    },
  }))
  .withMiddlewares((middleware) => {
    middleware.group("web", ["example-http:example"]);
    middleware.use("web");
  });
