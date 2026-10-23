import { BunAdapter, type BunHttpServer } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";

let server: BunHttpServer;
export function activeServer(): BunHttpServer { return server; }

export default defineApp().withAdapter(new BunAdapter<{ id: string }>({
  role: "http", handleSignals: false,
  http: {
    hostname: "127.0.0.1", port: 0,
    auth: { defaultGuard: "query", guards: [{ name: "query", authenticate({ http }) {
      const token = new URL(http.request.url).searchParams.get("token");
      return token === "alice" || token === "bob" ? { id: token } : undefined;
    } }] },
    websocket: {
      mapIdentity(context) { return context.auth?.principal ? { userId: context.auth.principal.id } : undefined; },
      authorizeChannel({ channel, identity }) {
        return typeof identity === "object" && identity !== null && !Array.isArray(identity)
          && channel === `user:${identity.userId}`;
      },
      maxChannelsPerConnection: 2,
      shutdownGraceMs: 250,
    },
    onServer(value) { server = value; },
  },
}));
