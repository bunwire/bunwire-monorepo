import { pathToFileURL } from "node:url";
import { BUN_QUEUE_MANAGER } from "@bunwire/bun";
import app from "../../../fixtures/bun-milestone-11/src/bootstrap.js";
import { Audit, AuditJob } from "../../../fixtures/bun-milestone-11/src/jobs.js";
const { applicationRegistry } = await import(pathToFileURL(process.argv[2]!).href);
await app.withRuntimeRegistry(applicationRegistry).start();
try {
  const queues = app.rootContainer.get(BUN_QUEUE_MANAGER);
  await Promise.all([queues.job(AuditJob, "one").dispatch(), queues.job(AuditJob, "two", "extra", "tag").dispatch()]);
  const records = app.rootContainer.get(Audit).entries as { id: string; scope: string; kind: string; extra: string }[];
  if (records.length !== 2 || records[0]!.scope === records[1]!.scope || records.some((record) => record.kind !== "queue-job") || records[0]!.extra !== "default") throw new Error("Invalid generated job execution");
} finally { await app.stop(); }
console.log(`JOBS_OK ${app.state}`);
