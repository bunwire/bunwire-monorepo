import { Controller } from "@bunwire/core";
import { Route } from "@bunwire/electrobun";

type Callback = (_invocation: unknown, next: () => Promise<unknown>) => Promise<unknown>;
const middleware: Callback = (_invocation, next) => next();
const ShadowUse = Object.assign(
  (..._middleware: readonly Callback[]): MethodDecorator => () => undefined,
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
