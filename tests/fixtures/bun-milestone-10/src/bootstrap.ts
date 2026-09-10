import { BunAdapter, type BunHttpServer } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";

export let server: BunHttpServer;
export default defineApp().withAdapter(new BunAdapter({
  handleSignals: false,
  http: { hostname: "127.0.0.1", port: 0, onServer: (native) => { server = native; } },
}));
