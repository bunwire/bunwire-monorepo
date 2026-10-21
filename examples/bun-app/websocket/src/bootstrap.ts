import { BunAdapter } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";

interface Principal { readonly id: string }

export default defineApp().withAdapter(new BunAdapter<Principal>({
  role: "http",
  http: {
    hostname: "127.0.0.1", port: 3001,
    auth: { defaultGuard: "demo", guards: [{ name: "demo",
      authenticate({ http }) {
        const token = new URL(http.request.url).searchParams.get("token");
        return token === "demo" ? { id: "demo-user" } : undefined;
      },
    }] },
    websocket: {
      mapIdentity(context) { return context.auth?.principal ? { userId: context.auth.principal.id } : undefined; },
    },
    onServer(server) { console.log(`WebSocket example listening at ${server.url}`); },
  },
}));
