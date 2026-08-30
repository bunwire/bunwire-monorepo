import { BunAdapter } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";

export default defineApp()
  .withAdapter(new BunAdapter())
  .withMiddlewares((middleware) => {
    middleware.use("missing");
  });
