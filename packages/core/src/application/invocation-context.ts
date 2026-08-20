import type { Application } from "./application.js";
import type { Container } from "../container/container.js";
import { createToken } from "../container/tokens.js";

export interface InvocationContext<ApplicationContext = unknown> {
  readonly id: number;
  readonly application: Application<ApplicationContext>;
  readonly applicationContext: ApplicationContext | undefined;
  readonly rootContainer: Container;
  readonly container: Container;
}

export interface ManagedInvocationOptions<ApplicationContext = unknown> {
  readonly configure?: (
    context: InvocationContext<ApplicationContext>,
  ) => void | Promise<void>;
}

export const APPLICATION_CONTEXT = createToken<unknown>("bunwire.application-context");
export const INVOCATION_CONTEXT = createToken<InvocationContext>("bunwire.invocation-context");
