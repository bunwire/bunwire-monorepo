import { createToken, type RuntimeScheduleDefinition } from "@bunwire/core";
import type { BunExecutionScope } from "./execution-scopes.js";
export interface BunScheduledTaskContext { readonly definition: RuntimeScheduleDefinition; readonly scheduledAt: number; readonly startedAt: number; readonly timezone: string; readonly scope: BunExecutionScope }
export const BUN_SCHEDULE_CONTEXT = createToken<BunScheduledTaskContext>("bun.schedule-context");
