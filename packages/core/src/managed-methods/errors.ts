import type { ParameterResolverId } from "./identifiers.js";

export class ManagedMethodPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManagedMethodPlanError";
  }
}

export class CallerArgumentError extends Error {
  readonly minimum: number;
  readonly maximum: number;
  readonly received: number;

  constructor(method: PropertyKey, minimum: number, maximum: number, received: number) {
    super(
      `Managed method "${String(method)}" expects ${minimum === maximum ? `${minimum}` : `${minimum} to ${maximum}`} caller argument(s), but received ${received}.`,
    );
    this.name = "CallerArgumentError";
    this.minimum = minimum;
    this.maximum = maximum;
    this.received = received;
  }
}

export class UnknownParameterResolverError extends Error {
  readonly resolverId: ParameterResolverId;

  constructor(resolverId: ParameterResolverId) {
    super(
      `No parameter resolver is registered for ID "${resolverId}". Register the resolver before invoking this managed method.`,
    );
    this.name = "UnknownParameterResolverError";
    this.resolverId = resolverId;
  }
}
