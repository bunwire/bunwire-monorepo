import { Inject, Service, Provider, type InvocationContext } from "@bunwire/core";
import { Job as ManagedJob, BUN_EXECUTION_SCOPE, type BunExecutionScope } from "@bunwire/bun";
@Service()
export class Audit { readonly entries: unknown[] = []; }
@Provider()
export class Boot {
  register(): void {}
  boot(context: InvocationContext): void {
    if (context.container.get(BUN_EXECUTION_SCOPE).kind !== "queue-job") throw new Error("Job scope missing in boot");
  }
}
@ManagedJob({ id: "test.audit" })
export class AuditJob {
  protected queue = "audit";
  protected tries = 3;
  protected timeout = 5000;
  protected backoff = [0, 100];
  constructor(private readonly audit: Audit, @Inject(BUN_EXECUTION_SCOPE) private readonly scope: BunExecutionScope) {}
  handle(id: string, extra = "default", ...tags: string[]): void {
    this.audit.entries.push({ id, extra, tags, scope: this.scope.id, kind: this.scope.kind });
  }
}

@ManagedJob({ id: "test.defaults" })
export class DefaultsJob { handle(_id?: string): void {} }
