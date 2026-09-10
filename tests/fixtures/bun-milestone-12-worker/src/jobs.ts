import { Inject, Provider, createToken, type Container, type InvocationContext } from "@bunwire/core";
import { BUN_JOB_CONTEXT, Job, type BunJobContext } from "@bunwire/bun";
import { brokerCall } from "./driver.js";

export const BOOT = createToken<string>("worker-test.boot");
const RESOURCE = createToken<object>("worker-test.resource");
@Provider()
export class WorkerProvider {
  register(_container: Container): void {}
  boot(context: InvocationContext): void {
    const job = context.container.get(BUN_JOB_CONTEXT);
    context.container.value(BOOT, job.envelope.id);
  }
}
@Job({ id: "process.worker-job" })
export class ProcessJob {
  protected tries = 2;
  protected backoff = [20];
  constructor(@Inject(BUN_JOB_CONTEXT) private readonly context: BunJobContext, @Inject(BOOT) private readonly bootId: string) {}
  async handle(mode: "hold" | "retry" | "quick"): Promise<void> {
    const { envelope, scope } = this.context;
    if (this.bootId !== envelope.id || scope.kind !== "queue-job") throw new Error("Invalid generated job context/Provider boot.");
    scope.value(RESOURCE, {}, { dispose: async () => { await brokerCall("disposed", { id: envelope.id, attempts: envelope.attempts }); } });
    console.log(`ATTEMPT ${envelope.id} ${envelope.attempts}`);
    if (mode === "hold" && envelope.attempts === 1) await new Promise((resolve) => setTimeout(resolve, 1200));
    if (mode === "retry" && envelope.attempts === 1) throw new Error("Retry the first attempt.");
    await brokerCall("completed", { id: envelope.id, attempts: envelope.attempts });
  }
}
