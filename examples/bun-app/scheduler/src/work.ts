import { BUN_JOB_CONTEXT, BUN_SCHEDULE_CONTEXT, Job, Schedule, type BunJobContext, type BunScheduledTaskContext } from "@bunwire/bun";
import { Inject, Service } from "@bunwire/core";

@Service()
export class SchedulerDemoProgress {
  #completed = 0;
  #finish!: () => void;
  readonly done = new Promise<void>((resolve) => { this.#finish = resolve; });
  record(message: string): void {
    console.log(message);
    if (++this.#completed === 2) this.#finish();
  }
}

@Schedule("* * * * *")
export class CleanupExpiredSessions {
  constructor(
    private readonly progress: SchedulerDemoProgress,
    @Inject(BUN_SCHEDULE_CONTEXT) private readonly context: BunScheduledTaskContext,
  ) {}
  async handle(): Promise<void> {
    console.log("TASK_STARTED");
    if (process.env.BUNWIRE_SCHEDULER_HOLD === "true") await new Promise((resolve) => setTimeout(resolve, 150));
    this.progress.record(`TASK cleanup scheduledAt=${new Date(this.context.scheduledAt).toISOString()}`);
  }
}

@Job({ id: "example.daily-report" })
export class GenerateDailyReport {
  constructor(
    private readonly progress: SchedulerDemoProgress,
    @Inject(BUN_JOB_CONTEXT) private readonly context: BunJobContext,
  ) {}
  handle(label: string): void {
    this.progress.record(`JOB ${label} attempt=${this.context.envelope.attempts}`);
  }
}
