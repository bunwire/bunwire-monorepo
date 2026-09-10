import { defineClassKind, defineMethodKind, defineManagedClassDecorator, defineCompilerMetadataHandler, type ApplicationScheduleCompilationHandlerData, type ManagedClassCompilationHandlerData } from "@bunwire/core";
import { BunScheduleError, parseCronExpression, validateTimeZone } from "./cron.js";
import { JsonJobSerializer } from "./job-serializer.js";

export interface BunScheduleOptions { readonly cron?: string }
export interface BunScheduledTaskDefinition { readonly cron?: string; readonly id?: string; readonly timezone?: string; readonly overlap: "allow" | "without-overlap" | "single-server" | "without-overlap-single-server"; readonly lockFor?: number }
export type ScheduledTaskConstructor = new (...args: any[]) => { handle(): unknown };
export const BUN_SCHEDULED_TASK_KIND = defineClassKind({ id: "bun.scheduled-task", injectable: true, autoDiscover: true, analyzeConstructor: true, managedMethods: true, registry: true });
export const BUN_SCHEDULED_TASK_HANDLE_KIND = defineMethodKind({ id: "bun.scheduled-task.handle", allowedOn: [BUN_SCHEDULED_TASK_KIND], invocable: true });
function scheduleOptions(value: string | undefined): BunScheduleOptions {
  if (value !== undefined) parseCronExpression(value);
  return Object.freeze(value === undefined ? {} : { cron: value });
}
export const Schedule = defineManagedClassDecorator<string | undefined, BunScheduleOptions, "bun.schedule-decorator">({
  id: "bun.schedule-decorator", kind: BUN_SCHEDULED_TASK_KIND, compilerSymbol: { moduleSpecifier: "@bunwire/bun", exportName: "Schedule" }, bare: true, createMetadata: scheduleOptions,
  validateTarget(target) { if (typeof Object.getOwnPropertyDescriptor(target.prototype, "handle")?.value !== "function") throw new BunScheduleError("@Schedule requires an own handle() method."); },
});
function compiled(data: unknown, properties: Readonly<Record<string, unknown>>): BunScheduledTaskDefinition {
  const options = data as BunScheduleOptions; const cron = options.cron; if (cron !== undefined) parseCronExpression(cron);
  const id = properties.id; if (id !== undefined && (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(id))) throw new BunScheduleError("Schedule id must be stable letters/digits punctuation.");
  const timezone = properties.timezone === undefined ? undefined : validateTimeZone(properties.timezone as string);
  const without = properties.withoutOverlapping ?? false; const single = properties.onOneServer ?? false;
  if (typeof without !== "boolean" || typeof single !== "boolean") throw new BunScheduleError("Schedule overlap properties must be boolean literals.");
  const lockFor = properties.lockFor; if (lockFor !== undefined && (!Number.isSafeInteger(lockFor) || (lockFor as number) < 1)) throw new BunScheduleError("Schedule lockFor must be a positive safe integer.");
  if (single && id === undefined) throw new BunScheduleError("onOneServer schedules require an explicit stable id.");
  return Object.freeze({ ...(cron === undefined ? {} : { cron }), ...(id === undefined ? {} : { id }), ...(timezone === undefined ? {} : { timezone }), overlap: without && single ? "without-overlap-single-server" : without ? "without-overlap" : single ? "single-server" : "allow", ...(lockFor === undefined ? {} : { lockFor: lockFor as number }) });
}
export const BUN_SCHEDULED_TASK_COMPILATION_HANDLER = defineCompilerMetadataHandler({ id: "bun.scheduled-task-compilation", data: Object.freeze({
  type: "bunwire.managed-class-compilation", classKindIds: [BUN_SCHEDULED_TASK_KIND.id], scope: "transient", properties: ["id", "timezone", "withoutOverlapping", "onOneServer", "lockFor"], compileMetadata: compiled,
  intrinsicMethods: [{ name: "handle", kind: BUN_SCHEDULED_TASK_HANDLE_KIND, compilerSymbol: { moduleSpecifier: "@bunwire/bun", exportName: "BUN_SCHEDULED_TASK_HANDLE_KIND" }, parameters: "none" }],
} satisfies ManagedClassCompilationHandlerData) });
function cadence(calls: readonly { readonly name: string; readonly arguments: readonly unknown[] }[]): { cron: string; timezone?: string; overlap: BunScheduledTaskDefinition["overlap"]; lockFor?: number; id?: string } {
  let cron: string | undefined; let timezone: string | undefined; let without = false; let single = false; let lockFor: number | undefined; let id: string | undefined;
  const arity = (name: string, args: readonly unknown[], min: number, max = min): void => { if (args.length < min || args.length > max) throw new BunScheduleError(`${name}() received an invalid argument count.`); };
  for (const call of calls) switch (call.name) {
    case "cron": arity(call.name, call.arguments, 1); cron = call.arguments[0] as string; break;
    case "everyMinute": arity(call.name, call.arguments, 0); cron = "* * * * *"; break;
    case "hourlyAt": arity(call.name, call.arguments, 0, 1); { const minute = call.arguments[0] ?? 0; if (!Number.isSafeInteger(minute) || (minute as number) < 0 || (minute as number) > 59) throw new BunScheduleError("hourlyAt minute must be 0..59."); cron = `${minute} * * * *`; } break;
    case "dailyAt": arity(call.name, call.arguments, 1); { const match = typeof call.arguments[0] === "string" && /^(\d{2}):(\d{2})$/.exec(call.arguments[0]); if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new BunScheduleError("dailyAt requires HH:mm."); cron = `${Number(match[2])} ${Number(match[1])} * * *`; } break;
    case "timezone": arity(call.name, call.arguments, 1); timezone = validateTimeZone(call.arguments[0] as string); break;
    case "withoutOverlapping": arity(call.name, call.arguments, 0); without = true; break;
    case "onOneServer": arity(call.name, call.arguments, 0); single = true; break;
    case "lockFor": arity(call.name, call.arguments, 1); if (!Number.isSafeInteger(call.arguments[0]) || (call.arguments[0] as number) < 1) throw new BunScheduleError("lockFor requires a positive safe integer."); lockFor = call.arguments[0] as number; break;
    case "id": arity(call.name, call.arguments, 1); if (typeof call.arguments[0] !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(call.arguments[0])) throw new BunScheduleError("Schedule id is invalid."); id = call.arguments[0]; break;
  }
  if (!cron) throw new BunScheduleError("Schedule cadence is missing."); parseCronExpression(cron); if (single && !id) throw new BunScheduleError("onOneServer schedules require id().");
  return { cron, ...(timezone === undefined ? {} : { timezone }), overlap: without && single ? "without-overlap-single-server" : without ? "without-overlap" : single ? "single-server" : "allow", ...(lockFor === undefined ? {} : { lockFor }), ...(id ? { id } : {}) };
}
export const BUN_APPLICATION_SCHEDULE_HANDLER = defineCompilerMetadataHandler({ id: "bun.application-schedule", data: Object.freeze({
  type: "bunwire.application-schedule", jobClassKindIds: ["bun.job"], taskClassKindIds: [BUN_SCHEDULED_TASK_KIND.id],
  compile(input) { const data = cadence(input.calls); if (input.execution === "job") new JsonJobSerializer().serialize(input.arguments);
    return Object.freeze({ id: data.id ?? input.generatedId, execution: input.execution, arguments: input.arguments, cron: data.cron, ...(data.timezone === undefined ? {} : { timezone: data.timezone }), overlap: data.overlap, ...(data.lockFor === undefined ? {} : { lockFor: data.lockFor }) }); },
  decorated(input) { const data = input.targetData as BunScheduledTaskDefinition; if (!data.cron) return undefined;
    return Object.freeze({ id: data.id ?? input.generatedId, execution: "direct", arguments: [], cron: data.cron, ...(data.timezone === undefined ? {} : { timezone: data.timezone }), overlap: data.overlap, ...(data.lockFor === undefined ? {} : { lockFor: data.lockFor }) }); },
} satisfies ApplicationScheduleCompilationHandlerData) });
export const BUN_SCHEDULE_NO_CALLER_CONTRACT_HANDLER = defineCompilerMetadataHandler({ id: "bun.schedule-no-caller-contract", data: Object.freeze({ type: "bunwire.no-caller-contract", methodKindIds: [BUN_SCHEDULED_TASK_HANDLE_KIND.id] }) });
