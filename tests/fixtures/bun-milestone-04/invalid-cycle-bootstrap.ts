import { BunAdapter } from "@bunwire/bun";
import { defineApp } from "@bunwire/core";

export default defineApp()
  .withAdapter(new BunAdapter())
  .withMiddlewares((middleware) => {
    middleware.group("first", ["second"]);
    middleware.group("second", ["first"]);
    middleware.use("first");
  });
