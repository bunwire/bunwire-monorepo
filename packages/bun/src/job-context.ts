import { createToken } from "@bunwire/core";
import type { BunExecutionScope } from "./execution-scopes.js";
import type { QueueEnvelope } from "./queue-driver.js";

export interface BunJobContext {
  readonly envelope: QueueEnvelope;
  readonly scope: BunExecutionScope;
  readonly signal: AbortSignal;
}
export const BUN_JOB_CONTEXT = createToken<BunJobContext>("bun.job-context");

/** Explicitly marks an attempt failure as non-retryable. */
export class BunJobFatalError extends Error {
  override readonly name: string = "BunJobFatalError";
}

/** Internal identity for invalid envelopes, payloads, and job/codec mismatches. */
export class InvalidJobError extends BunJobFatalError {
  override readonly name = "InvalidJobError";
}
