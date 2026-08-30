import { Get } from "@bunwire/bun";
import { Controller } from "@bunwire/core";

@Controller("/api/public")
export class PublicController {
  @Get()
  index(): Response { return new Response("public"); }
}
