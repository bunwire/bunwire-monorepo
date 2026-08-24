import { Inject, Middleware, createToken } from "@bunwire/core";
import type { FakeQueueMiddlewareContext } from "@bunwire/fake-queue";

export interface QueueInvocationValue { readonly id: number }
export const QUEUE_INVOCATION = createToken<QueueInvocationValue>("fake-queue.invocation");
export const queueEvents: string[] = [];
export let skippedConstructions = 0;
export let excludedConstructions = 0;
export let auditConstructions = 0;

export function resetQueueFixture(): void {
  queueEvents.length = 0;
  skippedConstructions = 0;
  excludedConstructions = 0;
  auditConstructions = 0;
}

@Middleware()
export class QueueAuditMiddleware {
  protected alias = "queue-audit";
  protected include = ["orders.create", "orders.failed"];
  protected only = ["command"];

  readonly instance = ++auditConstructions;
  constructor(@Inject(QUEUE_INVOCATION) private readonly invocation: QueueInvocationValue) {}

  async handle(context: FakeQueueMiddlewareContext, next: () => Promise<unknown>): Promise<unknown> {
    queueEvents.push(`before:${context.topic}:${context.parameters.join(",")}:${this.invocation.id}:${this.instance}`);
    queueEvents.push(`context:${Object.isFrozen(context)}:${Object.isFrozen(context.args)}:${Object.isFrozen(context.parameters)}`);
    const result = await next();
    queueEvents.push(`after:${context.topic}:${this.invocation.id}`);
    return `audit(${String(result)})`;
  }
}

@Middleware()
export class QueueEventMiddleware {
  protected alias = "queue-event";
  protected include = ["orders.created"];
  protected only = ["event"];

  handle(context: FakeQueueMiddlewareContext, next: () => Promise<unknown>): Promise<unknown> {
    queueEvents.push(`event-middleware:${context.topic}:${context.host.name}`);
    return next();
  }
}

@Middleware()
export class QueueSkippedMiddleware {
  protected alias = "queue-skipped";
  protected include = ["other.topic"];

  constructor() { skippedConstructions += 1; }
  handle(_context: FakeQueueMiddlewareContext, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}

@Middleware()
export class QueueExcludedMiddleware {
  protected alias = "queue-excluded";
  protected include = ["orders.create"];
  protected exclude = ["orders.create"];

  constructor() { excludedConstructions += 1; }
  handle(_context: FakeQueueMiddlewareContext, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}

@Middleware()
export class QueueShortMiddleware {
  protected alias = "queue-short";
  protected include = ["orders.short"];

  handle(context: FakeQueueMiddlewareContext): string {
    queueEvents.push(`short:${context.parameters[0]}`);
    return `short:${context.parameters[0]}`;
  }
}

@Middleware()
export class QueueFailureMiddleware {
  protected alias = "queue-failure";
  protected include = ["orders.failed"];
  handle(): never { throw new Error("queue middleware failure"); }
}
