import { Controller, Inject, Provider, Use, type Container, type InvocationContext } from "@bunwire/core";
import { Context, Message, Route, type ElectrobunContext } from "@bunwire/electrobun";
import { GENERATED_INVOCATION, generatedEvents } from "./middleware.js";

@Provider()
export class GeneratedInvocationProvider {
  register(_container: Container): void {}

  boot(context: InvocationContext): void {
    context.container.value(GENERATED_INVOCATION, { id: context.id });
    generatedEvents.push(`boot:${context.id}`);
  }
}

@Controller("generated")
export class GeneratedController {
  @Route("run")
  run(
    value: string,
    @Inject(GENERATED_INVOCATION) invocation: { readonly id: number },
    @Context() context: ElectrobunContext,
  ): string {
    generatedEvents.push(`controller:request:${invocation.id}:${context.window.title}`);
    return value;
  }

  @Use("generated-short:fixture")
  @Route("short")
  short(): string {
    generatedEvents.push("controller:short");
    return "not-short-circuited";
  }

  @Message("event")
  event(value: string, @Inject(GENERATED_INVOCATION) invocation: { readonly id: number }): string {
    generatedEvents.push(`controller:message:${invocation.id}:${value}`);
    return "ignored";
  }
}
