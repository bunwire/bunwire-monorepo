import { ValidationErrors, ValidationException } from "./errors.js";
import { getPath } from "./path.js";
import type { MessageMap, Path, RuleDefinitions, ValidationErrorsLike, ValidationOptions, ValidationResult } from "./types.js";
import { Validator } from "./validator.js";

export abstract class ValidationRequest<TInput extends Record<string, unknown>, TValidated = Partial<TInput>> {
  readonly input: TInput;
  readonly validator: Validator;
  #result: ValidationResult<TValidated> | undefined;

  constructor(input: TInput, validator: Validator = new Validator()) {
    this.input = input;
    this.validator = validator;
  }

  /** Returns the complete, unprojected request input. */
  all(): TInput { return this.input; }

  /** Returns a value from the complete input using a dot or bracket path. */
  get(path: string | Path, defaultValue?: unknown): unknown {
    const result = getPath(this.input, path);
    return result.present ? result.value : defaultValue;
  }

  abstract rules(): RuleDefinitions<TInput>;
  messages(): MessageMap { return {}; }
  attributes(): Readonly<Record<string, string>> { return {}; }

  validate(): ValidationResult<TValidated> {
    this.#result = this.validator.validate<TInput, TValidated>(this.input, this.rules(), this.options());
    return this.#result;
  }

  async validateAsync(): Promise<ValidationResult<TValidated>> {
    this.#result = await this.validator.validateAsync<TInput, TValidated>(this.input, this.rules(), this.options());
    return this.#result;
  }

  get errors(): ValidationErrorsLike { return this.#result?.errors ?? new ValidationErrors(); }

  /** Returns the successful result using the request's declared validated type. */
  validated(): TValidated {
    if (!this.#result || !this.#result.valid) throw new ValidationException(this.errors);
    return this.#result.data;
  }

  private options(): ValidationOptions { return { messages: this.messages(), attributes: this.attributes() }; }
}
