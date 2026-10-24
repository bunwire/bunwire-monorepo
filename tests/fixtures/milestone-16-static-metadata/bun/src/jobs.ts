import { Job, BUN_JOB_CONTEXT, type QueueEnvelope } from "@bunwire/bun";
import { Provider, type InvocationContext } from "@bunwire/core";
import { CRITICAL_QUEUE, STANDARD_BACKOFF } from "../queues/constants.js";
export const executions: string[] = [];
export const envelopes: QueueEnvelope[] = [];
@Provider() export class InspectPolicy {
  register(): void {}
  boot(context: InvocationContext): void { envelopes.push(context.container.get(BUN_JOB_CONTEXT).envelope); }
}
@Job({ id: "billing.charge" })
export class ChargeCardJob {
  protected queue = CRITICAL_QUEUE;
  protected backoff = STANDARD_BACKOFF;
  protected timeout = 60 * 1000;
  async handle(orderId: string) { executions.push(orderId); }
}
