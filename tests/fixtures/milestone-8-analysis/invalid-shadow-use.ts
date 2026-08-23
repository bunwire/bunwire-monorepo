import { Controller, type ManagedMethodMiddleware } from "@bunwire/core";
import { Route } from "@bunwire/electrobun";

const middleware: ManagedMethodMiddleware = (_invocation, next) => next();
const ShadowUse = Object.assign(
  (..._middleware: readonly ManagedMethodMiddleware[]): MethodDecorator => () => undefined,
  {
    definition: {
      id: "core.use" as const,
      compilerSymbol: { moduleSpecifier: "@fixture/shadow", exportName: "ShadowUse" },
    },
  },
);

@Controller("shadow")
export class ShadowUseController {
  @Route("run")
  @ShadowUse(middleware)
  run(): void {}
}
