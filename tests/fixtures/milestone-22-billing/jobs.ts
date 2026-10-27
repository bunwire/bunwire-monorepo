import { Job, BUN_JOB_CONTEXT, type QueueEnvelope } from "@bunwire/bun";
import { Provider, Service, type InvocationContext } from "@bunwire/core";
import { BACKOFF, JOB_ID, QUEUE, TIMEOUT } from "./barrel.js";

export const deliveries: unknown[][] = [];
export const envelopes: QueueEnvelope[] = [];
let signal: (() => void) | undefined;
export const delivered = new Promise<void>((resolve) => { signal = resolve; });

@Service() export class BillingAudit {
  readonly records: string[] = [];
  record(id: string) { this.records.push(id); }
}

@Provider() export class InspectBilling {
  register(): void {}
  boot(context: InvocationContext): void {
    if (context.container.has(BUN_JOB_CONTEXT)) envelopes.push(context.container.get(BUN_JOB_CONTEXT).envelope);
  }
}

@Job({ id: JOB_ID }) export class Charge {
  constructor(private readonly audit: BillingAudit) {}
  protected queue = QUEUE;
  protected backoff = BACKOFF;
  protected timeout = TIMEOUT;
  async handle(id: string, options: { readonly limit: number }) {
    deliveries.push([id, options]);
    this.audit.record(id);
    signal?.();
  }
}
