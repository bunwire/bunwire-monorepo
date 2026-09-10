import { Controller, EventDispatcher, Service } from "@bunwire/core";
import { Context, Get, type BunHttpContext } from "@bunwire/bun";
import { DomainEvent as Event, ReactsTo as Listener } from "./reexports.js";

@Service()
export class AuditLog {
  readonly records: string[] = [];
}

@Event()
export class WorkStarted {
  protected alias = "work.started";
  constructor(readonly id: string) {}
}

@Event()
export class WorkObserved {
  protected alias = "work.observed";
  constructor(readonly id: string) {}
}

@Event()
export class Unobserved {}

@Event()
export class WorkFailed {}

@Listener(WorkStarted)
export class FirstObserver {
  constructor(private readonly audit: AuditLog, private readonly events: EventDispatcher) {}
  async handle(event: WorkStarted): Promise<void> {
    this.audit.records.push(`${event.id}:first`);
    await this.events.dispatch(new WorkObserved(event.id));
    this.audit.records.push(`${event.id}:after-nested`);
  }
}

@Listener(WorkStarted)
export class SecondObserver {
  constructor(private readonly audit: AuditLog) {}
  handle(event: WorkStarted): void { this.audit.records.push(`${event.id}:second`); }
}

@Listener(WorkObserved)
export class NestedObserver {
  constructor(private readonly audit: AuditLog) {}
  handle(event: WorkObserved): void { this.audit.records.push(`${event.id}:nested`); }
}

@Listener(WorkFailed)
export class FailingObserver {
  handle(_event: WorkFailed): never { throw new Error("private listener failure"); }
}

@Listener(WorkFailed)
export class SkippedObserver {
  constructor(private readonly audit: AuditLog) {}
  handle(_event: WorkFailed): void { this.audit.records.push("unreachable"); }
}

@Service()
export class WorkService {
  constructor(private readonly events: EventDispatcher, private readonly audit: AuditLog) {}
  async start(id: string): Promise<readonly string[]> {
    await this.events.dispatch(new WorkStarted(id));
    return this.audit.records.filter((entry) => entry.startsWith(`${id}:`));
  }
}

@Controller("/events")
export class EventController {
  constructor(private readonly work: WorkService, private readonly events: EventDispatcher, private readonly audit: AuditLog) {}

  @Get("/run/:id")
  async run(@Context() context: BunHttpContext): Promise<readonly string[]> {
    return this.work.start(context.route.params.id!);
  }

  @Get("/empty")
  async empty(): Promise<void> { await this.events.dispatch(new Unobserved()); }

  @Get("/failure")
  async failure(): Promise<void> { await this.events.dispatch(new WorkFailed()); }

  @Get("/audit")
  auditRecords(): readonly string[] { return this.audit.records; }
}
