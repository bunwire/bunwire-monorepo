import { pathToFileURL } from "node:url";
import { BUN_QUEUE_MANAGER } from "@bunwire/bun";
import app from "../../fixtures/milestone-16-static-metadata/bun/src/bootstrap.js";
import { ChargeCardJob, executions, envelopes } from "../../fixtures/milestone-16-static-metadata/bun/src/jobs.js";
const { applicationRegistry } = await import(pathToFileURL(process.argv[2]!).href);
const job = applicationRegistry.classes.find((entry: { target: unknown }) => entry.target === ChargeCardJob);
if (job.data.queue !== "critical-billing" || job.data.timeout !== 60000 || job.data.tries !== 1 || job.data.backoff.join() !== "1000,5000,30000") throw new Error("Incorrect generated policy");
await app.withRuntimeRegistry(applicationRegistry).start();
try {
  const receipt = await app.rootContainer.get(BUN_QUEUE_MANAGER).job(ChargeCardJob, "order-1").dispatch();
  if (receipt.queue !== "critical-billing" || executions.join() !== "order-1") throw new Error("Incorrect generated execution");
  const actual = envelopes[0];
  if (!actual || actual.queue !== "critical-billing" || actual.policy.timeout !== 60000 || actual.policy.tries !== 1 || actual.policy.backoff.join() !== "1000,5000,30000" || actual.attempts !== 1) throw new Error("Incorrect runtime attempt policy");
} finally { await app.stop(); }
console.log("STATIC_JOB_OK");
