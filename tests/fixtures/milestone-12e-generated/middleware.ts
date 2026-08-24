import { Inject, Middleware, createToken } from "@bunwire/core";
import type { ElectrobunMiddlewareContext } from "@bunwire/electrobun";

export interface GeneratedInvocationValue {
  readonly id: number;
}

export const GENERATED_INVOCATION = createToken<GeneratedInvocationValue>("milestone-12e.generated-invocation");
export const generatedEvents: string[] = [];

@Middleware()
export class GeneratedMiddleware {
  protected alias = "generated";
  protected include = ["/generated/**/"];

  constructor(@Inject(GENERATED_INVOCATION) private readonly invocation: GeneratedInvocationValue) {}

  async handle(context: ElectrobunMiddlewareContext, next: () => Promise<unknown>): Promise<unknown> {
    generatedEvents.push([
      "middleware",
      context.transport,
      context.endpoint,
      context.parameters.join(","),
      this.invocation.id,
      String(Object.isFrozen(context.args)),
    ].join(":"));
    const result = await next();
    return context.transport === "request" ? `generated(${String(result)})` : result;
  }
}

@Middleware()
export class GeneratedShortCircuitMiddleware {
  protected alias = "generated-short";
  protected include = ["generated/short"];
  protected only = ["request"];

  handle(context: ElectrobunMiddlewareContext): string {
    return `short:${context.parameters[0]}`;
  }
}
