import type { Constructable } from "../container/tokens.js";

export type ScheduleTarget = Constructable<{ handle(...args: any[]): unknown }>;
export type ScheduleTargetArguments<Target extends ScheduleTarget> = Parameters<InstanceType<Target>["handle"]>;
export type ScheduleExecution = "direct" | "job";
export type ScheduleOverlap = "allow" | "without-overlap" | "single-server" | "without-overlap-single-server";

export interface RuntimeScheduleDefinition {
  readonly id: string;
  readonly target: ScheduleTarget;
  readonly execution: ScheduleExecution;
  readonly arguments: readonly unknown[];
  readonly cron: string;
  readonly timezone?: string;
  readonly overlap: ScheduleOverlap;
  readonly lockFor?: number;
}
export interface DefineRuntimeScheduleOptions extends Omit<RuntimeScheduleDefinition, "arguments"> { readonly arguments?: readonly unknown[] }
export function defineRuntimeSchedule(options: DefineRuntimeScheduleOptions): RuntimeScheduleDefinition {
  if (!options || typeof options !== "object" || typeof options.id !== "string" || !options.id || typeof options.target !== "function"
    || !["direct", "job"].includes(options.execution) || typeof options.cron !== "string" || !options.cron
    || (options.timezone !== undefined && (typeof options.timezone !== "string" || !options.timezone))
    || !["allow", "without-overlap", "single-server", "without-overlap-single-server"].includes(options.overlap)
    || (options.lockFor !== undefined && (!Number.isSafeInteger(options.lockFor) || options.lockFor < 1)) || !Array.isArray(options.arguments ?? [])) {
    throw new TypeError("Runtime schedules require a stable ID, target, execution, cron, optional timezone, overlap and optional positive lock duration.");
  }
  return Object.freeze({ ...options, arguments: Object.freeze([...(options.arguments ?? [])]) });
}
export interface ConfiguredScheduleBuilder {
  id(value: string): this;
  timezone(value: string): this;
  withoutOverlapping(): this;
  onOneServer(): this;
  lockFor(milliseconds: number): this;
}
export interface ScheduleCadenceBuilder {
  cron(expression: string): ConfiguredScheduleBuilder;
  everyMinute(): ConfiguredScheduleBuilder;
  hourlyAt(minute?: number): ConfiguredScheduleBuilder;
  dailyAt(time: string): ConfiguredScheduleBuilder;
}
export interface ApplicationScheduleRegistry {
  job<Target extends ScheduleTarget>(target: Target, ...arguments_: ScheduleTargetArguments<Target>): ScheduleCadenceBuilder;
  task<Target extends ScheduleTarget>(target: Target): ScheduleCadenceBuilder;
}
export type ApplicationScheduleConfiguration = (schedule: ApplicationScheduleRegistry) => void;
