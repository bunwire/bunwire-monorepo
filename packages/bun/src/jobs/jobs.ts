import {
  defineClassKind, defineMethodKind, defineManagedClassDecorator, defineCompilerMetadataHandler,
  type ManagedClassCompilationHandlerData,
} from "@bunwire/core";

export class BunQueueError extends Error { override readonly name = "BunQueueError"; }
export interface BunJobOptions { readonly id: string }
export interface JobPolicy {
  readonly tries: number;
  readonly timeout?: number;
  readonly backoff: readonly number[];
}
export interface BunJobDefinition extends JobPolicy { readonly id: string; readonly queue: string }
export type JobConstructor = new (...args: any[]) => { handle(...args: any[]): unknown };
export type JobArguments<T extends JobConstructor> = Parameters<InstanceType<T>["handle"]>;

export const BUN_JOB_KIND = defineClassKind({
  id: "bun.job", injectable: true, autoDiscover: true, analyzeConstructor: true, managedMethods: true, registry: true,
});
export const BUN_JOB_HANDLE_KIND = defineMethodKind({ id: "bun.job.handle", allowedOn: [BUN_JOB_KIND], invocable: true });

export function queueName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) throw new BunQueueError("Queue name must be a non-empty trimmed string.");
  return value;
}
export function queueInteger(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) throw new BunQueueError(`${label} must be a safe integer >= ${minimum}.`);
  return value;
}
export function jobPolicy(value: JobPolicy): JobPolicy {
  if (!value || !Array.isArray(value.backoff)) throw new BunQueueError("Job backoff must be an array of non-negative millisecond delays.");
  return Object.freeze({
    tries: queueInteger(value.tries, "Job tries", 1),
    ...(value.timeout === undefined ? {} : { timeout: queueInteger(value.timeout, "Job timeout", 1) }),
    backoff: Object.freeze(Array.from(value.backoff, (delay) => queueInteger(delay, "Job backoff"))),
  });
}
function jobIdentity(options: BunJobOptions): Readonly<BunJobOptions> {
  if (!options || typeof options.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(options.id)
    || Object.keys(options).some((key) => key !== "id")) throw new BunQueueError("@Job requires only an explicit stable id (letters, digits, '.', '_', ':', '-').");
  return Object.freeze({ id: options.id });
}
export const Job = defineManagedClassDecorator<BunJobOptions, Readonly<BunJobOptions>, "bun.job-decorator">({
  id: "bun.job-decorator", kind: BUN_JOB_KIND, compilerSymbol: { moduleSpecifier: "@bunwire/bun", exportName: "Job" },
  bare: false, createMetadata: jobIdentity,
  validateTarget(target) {
    if (typeof Object.getOwnPropertyDescriptor(target.prototype, "handle")?.value !== "function") throw new BunQueueError("@Job requires an own handle() method.");
  },
});
export function compiledJobDefinition(metadata: unknown, properties: Readonly<Record<string, unknown>>): BunJobDefinition {
  const { id } = jobIdentity(metadata as BunJobOptions);
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) throw new BunQueueError("Generated job policy must be an object.");
  return Object.freeze({ id, queue: queueName(Object.hasOwn(properties, "queue") ? properties.queue : "default"), ...jobPolicy({
    tries: (Object.hasOwn(properties, "tries") ? properties.tries : 1) as number,
    ...(Object.hasOwn(properties, "timeout") ? { timeout: queueInteger(properties.timeout, "Job timeout", 1) } : {}),
    backoff: (Object.hasOwn(properties, "backoff") ? properties.backoff : []) as readonly number[],
  }) });
}
export const BUN_JOB_COMPILATION_HANDLER = defineCompilerMetadataHandler({
  id: "bun.job-compilation",
  data: Object.freeze({
    type: "bunwire.managed-class-compilation", classKindIds: Object.freeze([BUN_JOB_KIND.id]), scope: "transient",
    properties: Object.freeze(["queue", "tries", "timeout", "backoff"]), compileMetadata: compiledJobDefinition,
    intrinsicMethods: Object.freeze([Object.freeze({ name: "handle", kind: BUN_JOB_HANDLE_KIND,
      compilerSymbol: Object.freeze({ moduleSpecifier: "@bunwire/bun", exportName: "BUN_JOB_HANDLE_KIND" }), parameters: "payload-only" })]),
  } satisfies ManagedClassCompilationHandlerData),
});
export const BUN_JOB_NO_CALLER_CONTRACT_HANDLER = defineCompilerMetadataHandler({
  id: "bun.job-no-caller-contract", data: Object.freeze({ type: "bunwire.no-caller-contract", methodKindIds: Object.freeze([BUN_JOB_HANDLE_KIND.id]) }),
});
