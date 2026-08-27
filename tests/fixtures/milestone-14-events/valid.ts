import { EventDispatcher, Service } from "@bunwire/core";
import { DomainEvent as Event, ReactsTo as Listener } from "./reexports.js";

@Service()
export class AuditService {
  readonly records: string[] = [];

  async record(userId: string): Promise<void> {
    this.records.push(userId);
  }
}

@Event()
export class UserRegistered {
  protected alias = "user.registered";

  constructor(readonly userId: string) {}
}

@Event()
export class AuditRequested {
  protected alias = "audit.requested";

  constructor(readonly userId: string) {}
}

@Event()
export class NothingObserved {}

export class AuditBase {
  constructor(protected readonly audit: AuditService) {}

  async handle(event: UserRegistered): Promise<void> {
    await this.audit.record(`base:${event.userId}`);
  }
}

@Listener(UserRegistered)
export class InheritedAuditListener extends AuditBase {
  constructor(audit: AuditService) {
    super(audit);
  }
}

@Listener(UserRegistered)
export class AuditUserRegistration {
  constructor(
    private readonly audit: AuditService,
    private readonly events: EventDispatcher,
  ) {}

  async handle(event: UserRegistered): Promise<void> {
    await this.audit.record(event.userId);
    await this.events.dispatch(new AuditRequested(event.userId));
  }
}

@Listener(AuditRequested)
export class RecordAuditRequest {
  constructor(private readonly audit: AuditService) {}

  async handle(event: AuditRequested): Promise<void> {
    await this.audit.record(`nested:${event.userId}`);
  }
}

export class UndecoratedEventChild extends UserRegistered {}

export class UndecoratedListenerChild extends AuditUserRegistration {}

@Event()
export class DecoratedEventChild extends UserRegistered {}

@Listener(UserRegistered)
export class DecoratedInheritedListener extends AuditBase {
  constructor(audit: AuditService) {
    super(audit);
  }
}
