export class EventDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventDefinitionError";
  }
}

export class EventDispatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventDispatchError";
  }
}

