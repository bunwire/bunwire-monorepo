import { describe, expect, it, vi } from "vitest";
import { defineApp } from "@bunwire/core";
import { BUN_QUEUE_MANAGER, BUN_SCHEDULER, BunAdapter, MemoryQueueDriver, type BunOperationRecord } from "@bunwire/bun";
import { runScheduledTick } from "@bunwire/bun/testing";
import registry from "../../../examples/bun-app/scheduler/.bunwire/registry.js";
import { SchedulerDemoProgress } from "../../../examples/bun-app/scheduler/src/work.js";

describe("Bun milestone 16 scheduler to worker integration", () => {
  it("dispatches a generated scheduled job and executes it through a real worker loop", async () => {
    const records: BunOperationRecord[] = [];
    const app = defineApp().withAdapter(new BunAdapter({ role: "command", handleSignals: false,
      queues: { driver: new MemoryQueueDriver() }, observability: (record) => { records.push(record); },
    })).withRuntimeRegistry(registry);
    await app.start();
    try {
      const worker = app.rootContainer.get(BUN_QUEUE_MANAGER).createWorker();
      worker.start();
      const tickStarted = performance.now();
      const count = await runScheduledTick(app.rootContainer.get(BUN_SCHEDULER), Date.UTC(2026, 9, 21, 12, 0));
      const tickMs = performance.now() - tickStarted;
      expect(count).toBe(2);
      expect(tickMs).toBeLessThan(10_000);
      console.log(`Bun performance sanity: schedule tick ${tickMs.toFixed(1)}ms`);
      await Promise.race([app.rootContainer.get(SchedulerDemoProgress).done,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Scheduled worker work timed out.")), 5000))]);
      expect(records.some((record) => record.kind === "schedule" && record.phase === "end" && record.scheduledTask === "example.daily-report.schedule")).toBe(true);
      await vi.waitFor(() => expect(records.some((record) => record.kind === "job" && record.phase === "end" && record.job === "example.daily-report" && record.attempt === 1)).toBe(true));
      await vi.waitFor(() => expect(worker.activeCount).toBe(0));
    } finally { await app.stop(); }
    expect(app.state).toBe("stopped");
  });
});
