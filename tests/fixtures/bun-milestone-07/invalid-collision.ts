import { Middleware } from "@bunwire/core";

@Middleware()
export class ConflictingCsrfMiddleware {
  protected alias = "csrf";
  handle(): Response { return new Response(); }
}
