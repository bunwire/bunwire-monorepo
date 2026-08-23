export class MiddlewareDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MiddlewareDefinitionError";
  }
}

export class MiddlewareAttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MiddlewareAttachmentError";
  }
}

export class MiddlewareExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MiddlewareExecutionError";
  }
}

export class MiddlewareNextError extends MiddlewareExecutionError {
  constructor(targetName: string) {
    super(`Middleware "${targetName}" next() may only be called once.`);
    this.name = "MiddlewareNextError";
  }
}
