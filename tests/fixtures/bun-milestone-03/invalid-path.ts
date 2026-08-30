import { Controller } from "@bunwire/core";
import { Get } from "@bunwire/bun";

@Controller()
export class InvalidPathRoute {
  @Get("/bad//path") get(): Response { return new Response(); }
}
