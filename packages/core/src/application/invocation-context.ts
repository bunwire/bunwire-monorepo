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

export interface ManagedInvocationOptions<
  ApplicationContext = unknown,
  Result = unknown,
> {
  readonly parentContainer?: Container;
  readonly configure?: (
    context: InvocationContext<ApplicationContext>,
  ) => void | Promise<void>;
  readonly around?: ManagedInvocationAround<ApplicationContext, Result>;
}

export type ManagedInvocationContinuation<Result = unknown> = () => Promise<Result>;

export type ManagedInvocationAround<
  ApplicationContext = unknown,
  Result = unknown,
> = (
  context: InvocationContext<ApplicationContext>,
  next: ManagedInvocationContinuation<Result>,
) => Result | Promise<Result>;

export const APPLICATION_CONTEXT = createToken<unknown>("bunwire.application-context");
export const INVOCATION_CONTEXT = createToken<InvocationContext>("bunwire.invocation-context");
