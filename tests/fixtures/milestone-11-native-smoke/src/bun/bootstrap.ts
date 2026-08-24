import { defineApp } from "@bunwire/core";
import { ElectrobunAdapter } from "@bunwire/electrobun";

export default defineApp()
  .withAdapter(new ElectrobunAdapter({
    mainWindow: {
      title: "Bunwire Milestone 12E Native Smoke",
      width: 480,
      height: 320,
    },
  }))
  .withMiddlewares((middleware) => {
    middleware.use("native-managed:smoke-param");
  });
