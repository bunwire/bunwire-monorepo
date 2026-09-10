import { Job } from "@bunwire/bun";
import { Service } from "@bunwire/core";
@Service()
export class ExampleJobAudit { readonly records: string[] = []; }
@Job({ id: "example.record-action" })
export class RecordExampleJob {
  protected queue = "audit";
  constructor(private readonly audit: ExampleJobAudit) {}
  handle(id: string): void { this.audit.records.push(id); }
}
