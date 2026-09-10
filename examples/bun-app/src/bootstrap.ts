import { BunAdapter, SyncQueueDriver, createSessionAuthGuard } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";
import { resolveExamplePrincipal, type ExamplePrincipal } from "./auth.js";
import pageManifest from "../.bunwire/pages.js";
import { actionCodec } from "./events.js";

export default defineApp()
  .withAdapter(new BunAdapter<ExamplePrincipal>({
    queues: { driver: new SyncQueueDriver(), eventCodecs: [actionCodec] },
    http: {
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
    },
  }))
  .withMiddlewares((middleware) => {
    middleware.group("web", ["example-http:example"]);
    middleware.use("web");
  });
