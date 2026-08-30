import {
  Context,
  Get,
  Post,
  type BunHttpContext,
} from "@bunwire/bun";
import { Controller, Use } from "@bunwire/core";

@Controller("/api")
export class HomeController {
  @Get()
  index(@Context() context: BunHttpContext): Response {
    return Response.json({
      method: context.route.method,
      name: "bunwire",
    });
  }

  @Post("/echo/:id")
  echo(@Context() context: BunHttpContext): Response {
    return Response.json({
      id: context.route.params.id,
      method: context.request.method,
      scopeId: context.scope.id,
      url: context.request.url,
    });
  }

  @Use("example-guard:deny")
  @Get("/blocked")
  blocked(): Response {
    return new Response("unreachable");
  }
}
