import { Get } from "@bunwire/bun";
import { Controller, Use } from "@bunwire/core";

@Controller("/limited")
export class ThrottleController {
  @Use("throttle:api")
  @Get("/items")
  items(): string { return "ok"; }
}
