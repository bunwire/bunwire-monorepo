import { defineApp } from "@bunwire/core";
import { NeverExecutedMiddleware } from "./analysis-only.js";

throw new Error("Milestone 12D analysis imported the bootstrap.");

export default defineApp().withMiddlewares((middleware) => {
  middleware.use(NeverExecutedMiddleware);
});
