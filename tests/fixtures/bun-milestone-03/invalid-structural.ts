import { Controller } from "@bunwire/core";
import { Get } from "@bunwire/bun";

@Controller("/api")
export class ConflictingRoutes {
  @Get("users/:id") first(): Response { return new Response(); }
  @Get("users/:name") second(): Response { return new Response(); }
}
