import { BillingAuth } from "./middleware.js";

export const QUEUE = "critical-" + "billing";
export const BACKOFF = [1_000, 5_000, 30_000] as const;
export const TIMEOUT = 30 * 2_000;
export const JOB_ID = "billing." + "charge";
export const SCHEDULE_ARGS = ["scheduled", { limit: 2 * 3 }] as const;
export const TIME = "04:" + "30";
export const GLOBAL = [BillingAuth, "billing-audit:global"] as const;
export const COMMON = ["billing-audit:strict"] as const;
export const ADMIN_GLOB = "controllers/admin/**";
export const ADMIN_MAPPING = { [ADMIN_GLOB]: "admin" };
