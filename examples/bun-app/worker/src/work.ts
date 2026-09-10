import { BUN_JOB_CONTEXT, Job, Queue, defineQueueEventCodec, type BunJobContext } from "@bunwire/bun";
import { Event, Inject, Listener, Service } from "@bunwire/core";

@Service()
export class DemoProgress {
  private completed = 0;
  private finish!: () => void;
  readonly done = new Promise<void>((resolve) => { this.finish = resolve; });
  record(message: string): void {
    console.log(message);
    if (++this.completed === 2) this.finish();
  }
}

@Job({ id: "example.worker-greeting" })
export class Greet {
  protected tries = 2;
  protected backoff = [20];
  constructor(private readonly progress: DemoProgress, @Inject(BUN_JOB_CONTEXT) private readonly context: BunJobContext) {}
  handle(name: string): void {
    if (this.context.envelope.attempts === 1) throw new Error("Demonstrate one retry.");
    this.progress.record(`JOB ${name} attempt=${this.context.envelope.attempts}`);
  }
}

@Event()
export class Welcome {
  readonly #name: string;
  constructor(name: string) { this.#name = name; }
  get name(): string { return this.#name; }
}

export const welcomeCodec = defineQueueEventCodec({
  id: "example.welcome", version: 1, event: Welcome,
  encode: (event) => ({ name: event.name }),
  decode: (data) => {
    if (typeof data.name !== "string") throw new Error("Welcome payload requires a name.");
    return new Welcome(data.name);
  },
});

@Queue({ id: "example.worker-welcome", tries: 2 })
@Listener(Welcome)
export class SendWelcome {
  constructor(private readonly progress: DemoProgress, @Inject(BUN_JOB_CONTEXT) private readonly context: BunJobContext) {}
  handle(event: Welcome): void {
    this.progress.record(`LISTENER ${event.name} scope=${this.context.scope.kind}`);
  }
}
