import { Middleware } from "@bunwire/core";

@Middleware()
export class NeverExecuteMiddleware {
  static {
    throw new Error("middleware module executed during compilation");
  }

  constructor() {
    throw new Error("middleware constructor executed during compilation");
  }

  async handle(): Promise<never> {
    throw new Error("middleware handle executed during compilation");
  }
}
