export class ApplicationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationStateError";
  }
}
