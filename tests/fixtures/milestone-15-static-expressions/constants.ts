export const QUEUE = "billing";
export const BACKOFF = [1_000, 5_000, 30_000] as const;
export const POLICY = { queue: QUEUE, backoff: BACKOFF, timeout: 60 * 1000 };
export class Job {}
export const JOB_ALIAS = Job;
export const TOKEN = createToken("cache");
export const COUNTERFEIT = { kind: "bunwire.token", description: "cache" };
declare function createToken(description: string): unknown;

// Parsing this file must never perform any of these effects.
import { writeFileSync } from "node:fs";
writeFileSync(process.env.BUNWIRE_STATIC_SENTINEL!, "application executed");
throw new Error("Application module was executed");
