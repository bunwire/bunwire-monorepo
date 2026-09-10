import { Event, Listener, Service } from "@bunwire/core";
import { Queue, defineQueueEventCodec } from "@bunwire/bun";

@Event()
export class ExampleActionRecorded {
  protected alias = "example.action-recorded";
  constructor(readonly id: string) {}
}

@Service()
export class ExampleEventAudit {
  readonly records: string[] = [];
}

@Listener(ExampleActionRecorded)
export class RecordExampleAction {
  constructor(private readonly audit: ExampleEventAudit) {}

  handle(event: ExampleActionRecorded): void {
    this.audit.records.push(event.id);
  }
}

export const actionCodec = defineQueueEventCodec({
  id: "example.action", version: 1, event: ExampleActionRecorded,
  encode: (event) => ({ id: event.id }),
  decode: (data) => {
    if (typeof data.id !== "string") throw new Error("Action payload requires an id.");
    return new ExampleActionRecorded(data.id);
  },
});

@Service()
export class ExampleQueuedAudit { readonly records: string[] = []; }

@Queue({ id: "example.queued-action" })
@Listener(ExampleActionRecorded)
export class QueueExampleAction {
  constructor(private readonly audit: ExampleQueuedAudit) {}
  handle(event: ExampleActionRecorded): void { this.audit.records.push(event.id); }
}
