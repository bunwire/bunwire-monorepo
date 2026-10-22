import { Get } from "@bunwire/bun";
import { Controller, Use } from "@bunwire/core";

@Controller("/signed")
export class SignedController {
  @Use("signed")
  @Get("/download")
  download(): string { return "ok"; }
}
