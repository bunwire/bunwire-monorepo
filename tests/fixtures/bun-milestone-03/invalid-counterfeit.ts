import { Controller, defineManagedMethodDecorator } from "@bunwire/core";
import { BUN_HTTP_ROUTE_KIND } from "@bunwire/bun";

const Get = defineManagedMethodDecorator({
  id: "bun.http-get.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/bun", exportName: "Get" },
  kind: BUN_HTTP_ROUTE_KIND,
  createMetadata: () => ({ method: "GET", path: "/" }),
});

@Controller()
export class CounterfeitRoute {
  @Get() get(): Response { return new Response(); }
}
