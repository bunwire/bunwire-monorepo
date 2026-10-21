import { BunAdapter, type BunHttpServer } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";

type Principal = { id: string };
let server: BunHttpServer;
export function activeServer(): BunHttpServer { return server; }

export default defineApp().withAdapter(new BunAdapter<Principal>({
  role: "http", handleSignals: false,
  http: {
    hostname: "127.0.0.1", port: 0,
    auth: { defaultGuard: "query", guards: [{ name: "query",
      authenticate({ http }) { return new URL(http.request.url).searchParams.get("token") === "accepted" ? { id: "user-1" } : undefined; },
    }] },
    authorization: { policies: [{ name: "room", resolve: (id) => ({ id }),
      abilities: { view: ({ principal, resource }) => principal?.id === "user-1" && resource.id !== "restricted" },
    }] },
    websocket: {
      mapIdentity(context) { return context.auth?.principal ? { userId: context.auth.principal.id } : undefined; },
      shutdownGraceMs: 250,
    },
    onServer(value) { server = value; },
  },
}));
