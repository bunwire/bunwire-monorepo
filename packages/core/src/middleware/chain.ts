import type { InvocationContext } from "../application/invocation-context.js";
import {
  MiddlewareAttachmentError,
  MiddlewareExecutionError,
  MiddlewareNextError,
} from "./errors.js";
import {
  validateMiddlewareAttachment,
  type MiddlewareAttachment,
  type MiddlewareNext,
} from "./managed-middleware.js";

export type MiddlewareContextFactory<Context> = (
  attachment: MiddlewareAttachment,
  invocation: InvocationContext,
) => Context | Promise<Context>;

export type MiddlewareTerminal<Result> = () => Result | Promise<Result>;

export interface ExecuteMiddlewareChainOptions<Context, Result> {
  readonly invocation: InvocationContext;
  readonly attachments: readonly MiddlewareAttachment[];
  readonly createContext: MiddlewareContextFactory<Context>;
  readonly terminal: MiddlewareTerminal<Result>;
}

export async function executeMiddlewareChain<Context, Result>(
  options: ExecuteMiddlewareChainOptions<Context, Result>,
): Promise<Awaited<Result>> {
  if (!options || typeof options !== "object") {
    throw new MiddlewareExecutionError("Middleware chain options must be an object.");
  }
  if (!options.invocation?.container) {
    throw new MiddlewareExecutionError("Middleware chain requires an InvocationContext.");
  }
  if (!Array.isArray(options.attachments)) {
    throw new MiddlewareAttachmentError("Middleware chain attachments must be an array.");
  }
  if (typeof options.createContext !== "function") {
    throw new MiddlewareExecutionError("Middleware chain context factory must be callable.");
  }
  if (typeof options.terminal !== "function") {
    throw new MiddlewareExecutionError("Middleware chain terminal continuation must be callable.");
  }
  for (const attachment of options.attachments as readonly unknown[]) {
    validateMiddlewareAttachment(attachment);
  }

  const dispatch = async (index: number): Promise<unknown> => {
    const attachment = options.attachments[index];
    if (!attachment) {
      return options.terminal();
    }

    const instance = options.invocation.container.get(attachment.target);
    if (!instance || typeof instance.handle !== "function") {
      throw new MiddlewareExecutionError(
        `Resolved middleware "${attachment.target.name}" must define a callable handle(context, next) method.`,
      );
    }
    const context = await options.createContext(attachment, options.invocation);
    let called = false;
    const next: MiddlewareNext<unknown> = async () => {
      if (called) {
        throw new MiddlewareNextError(attachment.target.name);
      }
      called = true;
      return dispatch(index + 1);
    };
    return instance.handle(context, next);
  };

  return await dispatch(0) as Awaited<Result>;
}
