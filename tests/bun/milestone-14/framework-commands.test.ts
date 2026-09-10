import { afterEach, describe, expect, it } from "vitest";
import { Controller, defineApp, defineManagedMethodPlan, defineRuntimeRegistry, defineRuntimeSchedule, getManagedClassMetadata, type Application } from "@bunwire/core";
import { BUN_COMMAND_RUNTIME, BUN_HTTP_ROUTE_KIND, BUN_JOB_HANDLE_KIND, BUN_JOB_KIND, BUN_QUEUE_WORKER, BUN_SCHEDULED_TASK_HANDLE_KIND, BUN_SCHEDULED_TASK_KIND, BunAdapter, Get, Job, MemoryFailedJobStore, MemoryQueueDriver, Schedule, SyncQueueDriver, type BunCommandIO, type FailedJobRecord } from "@bunwire/bun";

const apps: Application[] = []; afterEach(async () => { await Promise.allSettled(apps.splice(0).map((app) => app.stop())); });
const output = () => { const stdout: string[] = []; const stderr: string[] = []; const io: BunCommandIO = { stdout: (line) => { stdout.push(line); }, stderr: (line) => { stderr.push(line); } }; return { io, stdout, stderr }; };
let scheduled = 0;
@Controller("/users") class UsersController { @Get(":id") show(): Response { return new Response(); } }
@Job({ id: "reports.build" }) class BuildReport { handle(_name: string): void {} }
@Schedule() class Cleanup { handle(): void { scheduled++; } }
function registry() {
  const route = defineManagedMethodPlan({ target: UsersController, ownerKind: Controller.definition.kind, kind: BUN_HTTP_ROUTE_KIND, method: "show", data: Get.definition.createMetadata(":id"), parameters: [] });
  const job = defineManagedMethodPlan({ target: BuildReport, ownerKind: BUN_JOB_KIND, kind: BUN_JOB_HANDLE_KIND, method: "handle", data: undefined, parameters: [{ source: "transport", methodIndex: 0, argumentIndex: 0, optional: false }] });
  const task = defineManagedMethodPlan({ target: Cleanup, ownerKind: BUN_SCHEDULED_TASK_KIND, kind: BUN_SCHEDULED_TASK_HANDLE_KIND, method: "handle", data: undefined, parameters: [] });
  return defineRuntimeRegistry({ classes: [
    { target: UsersController, kind: Controller.definition.kind, data: getManagedClassMetadata(UsersController)!.data },
    { target: BuildReport, kind: BUN_JOB_KIND, scope: "transient", data: { id: "reports.build", queue: "default", tries: 1, backoff: [] } },
    { target: Cleanup, kind: BUN_SCHEDULED_TASK_KIND, scope: "transient", data: { overlap: "allow" } },
  ], methods: [route, job, task], schedules: [defineRuntimeSchedule({ id: "cleanup", target: Cleanup, execution: "direct", cron: "* * * * *", overlap: "allow" })] });
}
async function run(argv: readonly string[]) { const app = defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false, queues: { driver: new SyncQueueDriver() } })).withRuntimeRegistry(registry()); apps.push(app); await app.start(); const result = output(); const code = await app.rootContainer.get(BUN_COMMAND_RUNTIME).run(argv, result.io); return { app, code, ...result }; }

describe("Bun framework commands", () => {
  it("lists routes, jobs and schedules from the generated registry", async () => {
    const routes = await run(["routes:list"]); expect(routes.code).toBe(0); expect(routes.stdout.join("\n")).toContain("GET\t/users/:id\tUsersController.show"); await routes.app.stop();
    const jobs = await run(["jobs:list"]); expect(jobs.stdout.join("\n")).toContain("reports.build\tdefault\ttries=1"); await jobs.app.stop();
    const schedules = await run(["schedule:list"]); expect(schedules.stdout.join("\n")).toContain("cleanup\t* * * * *\tUTC\tdirect\tCleanup\tallow");
  });
  it("runs due schedules once through the existing scheduler execution boundary", async () => {
    scheduled = 0; const result = await run(["schedule:run"]); expect(result.code).toBe(0); expect(scheduled).toBe(1); expect(result.stdout).toEqual(["Executed 1 due schedule(s)."]);
  });
  it("activates and drains a worker only when queue:work is selected", async () => {
    const app = defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false, queues: { driver: new MemoryQueueDriver(), worker: { pollIntervalMs: 5 } } })).withRuntimeRegistry(registry()); apps.push(app); await app.start();
    expect(() => app.rootContainer.get(BUN_QUEUE_WORKER)).toThrow(); const running = app.rootContainer.get(BUN_COMMAND_RUNTIME).run(["queue:work"], output().io);
    await new Promise((resolve) => setTimeout(resolve, 15)); expect(app.rootContainer.get(BUN_QUEUE_WORKER).state).toBe("running"); await app.stop(); await expect(running).resolves.toBe(0);
  });
  it("lists, retries and forgets failed work through QueueManager", async () => {
    const record: FailedJobRecord = Object.freeze({ envelope: Object.freeze({ version: 1, id: "failed-1", job: "reports.build", payload: '["daily"]', serializer: Object.freeze({ id: "bun.json", version: 1 }), queue: "default", attempts: 1, createdAt: 1, availableAt: 1, policy: Object.freeze({ tries: 1, backoff: Object.freeze([]) }) }), failedAt: 2, reason: "exhausted", error: Object.freeze({ name: "Error", message: "failed" }) });
    const startFailed = async () => { const store = new MemoryFailedJobStore(); const app = defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false, queues: { driver: new SyncQueueDriver(), failedJobs: store } })).withRuntimeRegistry(registry()); apps.push(app); await app.start(); await store.save(record); return { app, store }; };
    const listed = await startFailed(); const listedOutput = output(); expect(await listed.app.rootContainer.get(BUN_COMMAND_RUNTIME).run(["queue:failed"], listedOutput.io)).toBe(0); expect(listedOutput.stdout.join("\n")).toContain("failed-1\treports.build\tdefault\texhausted\t2"); await listed.app.stop();
    const retried = await startFailed(); const retriedOutput = output(); expect(await retried.app.rootContainer.get(BUN_COMMAND_RUNTIME).run(["queue:retry", "failed-1"], retriedOutput.io)).toBe(0); expect(retriedOutput.stdout[0]).toContain("reports.build\tdefault"); await retried.app.stop();
    const forgotten = await startFailed(); const forgottenOutput = output(); expect(await forgotten.app.rootContainer.get(BUN_COMMAND_RUNTIME).run(["queue:forget", "failed-1"], forgottenOutput.io)).toBe(0); expect(await forgotten.store.list()).toEqual([]);
  });
});
