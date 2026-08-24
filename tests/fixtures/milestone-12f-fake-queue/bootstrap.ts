import { defineApp } from "@bunwire/core";
import { FakeQueueAdapter } from "@bunwire/fake-queue";
import {
  QueueExcludedMiddleware,
  QueueFailureMiddleware,
  QueueSkippedMiddleware,
} from "./middleware.js";

export default defineApp()
  .withAdapter(new FakeQueueAdapter())
  .withMiddlewares((middlewares) => {
    middlewares.use("queue-audit:global");
    middlewares.use(QueueSkippedMiddleware);
    middlewares.use(QueueExcludedMiddleware);
    middlewares.use("queue-short:policy");
    middlewares.use(QueueFailureMiddleware);
    middlewares.use("queue-event:event-policy");
  });
