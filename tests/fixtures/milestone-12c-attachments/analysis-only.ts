import { Controller, Middleware, Use } from "@bunwire/core";
import { Route } from "@bunwire/electrobun";

@Middleware()
export class NeverLoadedMiddleware {
  protected alias = "never-loaded";
  static { throw new Error("middleware module executed"); }
  handle() { throw new Error("middleware handle executed"); }
}

@Use("never-loaded")
@Controller()
export class NeverLoadedController {
  static { throw new Error("Controller module executed"); }
  @Use(NeverLoadedMiddleware)
  @Route()
  run() { throw new Error("Controller method executed"); }
}
