import { Controller } from "@bunwire/core";
import { Get } from "@bunwire/bun";

@Controller("/api")
export class DuplicateRoutes {
  @Get("users/:id") first(): Response { return new Response(); }
  @Get("users/:id") second(): Response { return new Response(); }
}
