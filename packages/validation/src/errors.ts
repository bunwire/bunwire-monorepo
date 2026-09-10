import type { Path, ValidationError, ValidationErrorsLike } from "./types.js";
import { formatPath } from "./path.js";

export class ValidationErrors implements ValidationErrorsLike {
  readonly #errors: readonly ValidationError[];

  constructor(errors: readonly ValidationError[] = []) {
    this.#errors = Object.freeze([...errors]);
  }

  get size(): number { return this.#errors.length; }
  all(): readonly ValidationError[] { return this.#errors; }
  get(path: string | Path): readonly ValidationError[] {
    const key = formatPath(path);
    return this.#errors.filter((error) => formatPath(error.path) === key);
  }
  first(path: string | Path): ValidationError | undefined { return this.get(path)[0]; }
  has(path: string | Path): boolean { return this.first(path) !== undefined; }
}

export class AsyncRuleError extends Error {
  constructor(ruleName: string) {
    super(`Rule "${ruleName}" is asynchronous. Use validateAsync() instead.`);
    this.name = "AsyncRuleError";
  }
}

export class ValidationException extends Error {
  readonly errors: ValidationErrorsLike;
  constructor(errors: ValidationErrorsLike) {
    super("Validation failed.");
    this.name = "ValidationException";
    this.errors = errors;
  }
}
