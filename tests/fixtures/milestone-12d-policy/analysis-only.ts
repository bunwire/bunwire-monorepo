import { Controller, Middleware } from "@bunwire/core";
import { Route } from "@bunwire/electrobun";

throw new Error("Milestone 12D analysis imported application source code.");

@Middleware()
export class NeverExecutedMiddleware {
  protected alias = "never";
  marker = (() => { throw new Error("Middleware field initializer executed."); })();
  handle(_context: unknown, next: () => Promise<unknown>) { return next(); }
}

@Controller("never")
export class NeverExecutedController {
  @Route("run")
  run() { throw new Error("Controller method executed."); }
}
