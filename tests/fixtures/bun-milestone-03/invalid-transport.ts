import { Controller } from "@bunwire/core";
import { Get } from "@bunwire/bun";

@Controller()
export class TransportRoute {
  @Get("/users/:id") get(id: string): Response { return new Response(id); }
}
