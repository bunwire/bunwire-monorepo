import { Controller, Middleware, Service, Use } from "@bunwire/core";
import {
  Context,
  Message,
  Route,
  type ElectrobunContext,
  type ElectrobunMiddlewareContext,
} from "@bunwire/electrobun";

@Service()
export class SmokeDependency {
  wrap(value: unknown): string {
    return `managed(${String(value)})`;
  }
}

@Middleware()
export class NativeManagedMiddleware {
  protected alias = "native-managed";
  protected include = ["/smoke/**/"];

  constructor(private readonly dependency: SmokeDependency) {}

  async handle(context: ElectrobunMiddlewareContext, next: () => Promise<unknown>): Promise<unknown> {
    console.log(`BUNWIRE_NATIVE_SMOKE_MIDDLEWARE:${context.transport}:${context.parameters[0]}`);
    const result = await next();
    return context.transport === "request" ? this.dependency.wrap(result) : result;
  }
}

@Middleware()
export class NativeShortCircuitMiddleware {
  protected alias = "native-short";
  protected include = ["smoke/short"];
  protected only = ["request"];

  handle(context: ElectrobunMiddlewareContext): string {
    console.log(`BUNWIRE_NATIVE_SMOKE_SHORT:${context.parameters[0]}`);
    return `short:${context.parameters[0]}`;
  }
}

@Controller("smoke")
export class SmokeController {
  @Route("request")
  request(values: string[]): string {
    const result = values.join("|");
    console.log(`BUNWIRE_NATIVE_SMOKE_CONTROLLER:${result}`);
    return result;
  }

  @Use("native-short:blocked")
  @Route("short")
  short(): string {
    console.log("BUNWIRE_NATIVE_SMOKE_UNEXPECTED_SHORT_CONTROLLER");
    return "unexpected";
  }

  @Message("message")
  message(value: string, @Context() context: ElectrobunContext): void {
    console.log(`BUNWIRE_NATIVE_SMOKE_COMPLETE:${value}`);
    setTimeout(() => { void context.window.close(); }, 50);
  }
}
