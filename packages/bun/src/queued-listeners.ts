import { LISTENER_KIND, defineManagedClassAttachmentDecorator, defineCompilerMetadataHandler, type ManagedClassIdentityHandlerData } from "@bunwire/core";
import { BUN_JOB_KIND, BunQueueError, compiledJobDefinition, type BunJobDefinition, type JobPolicy } from "./jobs.js";

export interface BunQueuedListenerOptions extends Partial<JobPolicy> { readonly id: string; readonly queue?: string }
export type BunQueuedListenerDefinition = BunJobDefinition;
export const Queue = defineManagedClassAttachmentDecorator<BunQueuedListenerOptions, BunQueuedListenerDefinition, "bun.queue-listener">({
  id: "bun.queue-listener", allowedOn: [LISTENER_KIND], compilerSymbol: { moduleSpecifier: "@bunwire/bun", exportName: "Queue" },
  createMetadata(options) {
    if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((key) => !["id", "queue", "tries", "timeout", "backoff"].includes(key))) throw new BunQueueError("@Queue requires a stable listener id and optional queue/tries/timeout/backoff policy.");
    return compiledJobDefinition({ id: options.id }, options as unknown as Record<string, unknown>);
  },
});
export const BUN_QUEUE_IDENTITY_HANDLER = defineCompilerMetadataHandler({ id: "bun.queue-identity", data: Object.freeze({
  type: "bunwire.managed-class-identity", classKindIds: Object.freeze([BUN_JOB_KIND.id, LISTENER_KIND.id]),
  resolveIdentity: (input) => input.kindId === BUN_JOB_KIND.id ? (input.data as BunJobDefinition).id
    : (input.attachments.find((entry) => entry.definitionId === Queue.definition.id)?.data as BunQueuedListenerDefinition | undefined)?.id,
} satisfies ManagedClassIdentityHandlerData) });
