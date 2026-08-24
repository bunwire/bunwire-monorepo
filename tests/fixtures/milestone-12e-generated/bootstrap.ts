import { defineApp } from "@bunwire/core";
import { ElectrobunAdapter } from "@bunwire/electrobun";

export default defineApp()
  .withAdapter(new ElectrobunAdapter())
  .withMiddlewares((middleware) => {
    middleware.use("generated:policy");
  });
