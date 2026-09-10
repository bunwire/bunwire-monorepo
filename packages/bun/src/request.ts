import {
  createParameterResolverId,
  defineClassKind,
  defineCompilerMetadataHandler,
  defineManagedClassDecorator,
} from "@bunwire/core";
import {
  ValidationErrors,
  ValidationException,
  ValidationRequest,
  getPath,
  type MessageMap,
  type Path,
  type RuleDefinitions,
  type ValidationErrorsLike,
  type ValidationResult,
} from "@bunwire/validation";
import type { BunHttpContext } from "./http.js";
import type { BunSessionValue } from "./sessions.js";

export type BunFormRequestInput = Readonly<Record<string, unknown>>;
export type BunFormRequestQueryInput = Readonly<Record<string, string | readonly string[]>>;
export type BunFormRequestRouteInput = Readonly<Record<string, string>>;
export type BunFormRequestFileInput = Readonly<Record<string, File | readonly File[]>>;

export interface BunFormRequestSources {
  readonly route: BunFormRequestRouteInput;
  readonly query: BunFormRequestQueryInput;
  readonly body: BunFormRequestInput;
  readonly files: BunFormRequestFileInput;
}

export interface BunRequestClassMetadata {
  readonly type: "request";
}

export interface BunFormRequestInitialization<TValidated = unknown> {
  readonly authorized: boolean;
  readonly result?: ValidationResult<TValidated>;
  readonly oldInput?: Readonly<Record<string, BunSessionValue>>;
}

export const BUN_FORM_REQUEST_INITIALIZE: unique symbol = Symbol("bun.form-request.initialize");

function isSessionValue(value: unknown, ancestors = new Set<object>()): value is BunSessionValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.every((entry) => isSessionValue(entry, ancestors));
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
    return Object.getOwnPropertySymbols(value).length === 0
      && Object.values(value).every((entry) => isSessionValue(entry, ancestors));
  } finally { ancestors.delete(value); }
}

export class BunFormRequestError extends Error {
  override readonly name = "BunFormRequestError";
}

export const BUN_REQUEST_KIND = defineClassKind({
  id: "bun.request",
  injectable: false,
  autoDiscover: false,
  analyzeConstructor: true,
  managedMethods: false,
  registry: true,
});

export const BUN_FORM_REQUEST_RESOLVER_ID = createParameterResolverId("bun.form-request");

const REQUEST_METADATA = Object.freeze({ type: "request" as const });

export abstract class FormRequest<
  TInput extends Record<string, unknown> = Record<string, unknown>,
  TValidated = Partial<TInput>,
> {
  #context: BunHttpContext | undefined;
  #sources: BunFormRequestSources | undefined;
  #input: Record<string, unknown> | undefined;
  #delegate: ValidationRequest<TInput, TValidated> | undefined;
  #preparing = false;
  #initialized = false;

  get context(): BunHttpContext {
    if (!this.#context) throw new BunFormRequestError("Form Request context is unavailable before Bun HTTP initialization.");
    return this.#context;
  }

  get sources(): BunFormRequestSources {
    if (!this.#sources) throw new BunFormRequestError("Form Request sources are unavailable before Bun HTTP initialization.");
    return this.#sources;
  }

  all(): TInput {
    if (!this.#input) throw new BunFormRequestError("Form Request input is unavailable before Bun HTTP initialization.");
    return Object.freeze({ ...this.#input }) as TInput;
  }

  get(path: string | Path, defaultValue?: unknown): unknown {
    const result = getPath(this.all(), path);
    return result.present ? result.value : defaultValue;
  }

  abstract rules(): RuleDefinitions<TInput>;
  messages(): MessageMap { return {}; }
  attributes(): Readonly<Record<string, string>> { return {}; }
  authorize(): boolean | Promise<boolean> { return true; }
  protected prepareForValidation(): void | Promise<void> {}
  protected flashInput(): readonly string[] { return Object.freeze([]); }

  protected merge(values: Partial<TInput>): void {
    if (!this.#preparing || !this.#input) {
      throw new BunFormRequestError("Form Request input may only be merged during prepareForValidation().");
    }
    if (typeof values !== "object" || values === null || Array.isArray(values)) {
      throw new BunFormRequestError("Form Request merge values must be an object.");
    }
    this.#input = { ...this.#input, ...values };
  }

  validate(): ValidationResult<TValidated> {
    return this.delegate().validate();
  }

  validateAsync(): Promise<ValidationResult<TValidated>> {
    return this.delegate().validateAsync();
  }

  get errors(): ValidationErrorsLike {
    return this.#delegate?.errors ?? new ValidationErrors();
  }

  validated(): TValidated {
    if (!this.#delegate) throw new ValidationException(this.errors);
    return this.#delegate.validated();
  }

  private delegate(): ValidationRequest<TInput, TValidated> {
    if (this.#delegate) return this.#delegate;
    const input = this.all();
    const owner = this;
    this.#delegate = new (class extends ValidationRequest<TInput, TValidated> {
      override rules(): RuleDefinitions<TInput> { return owner.rules(); }
      override messages(): MessageMap { return owner.messages(); }
      override attributes(): Readonly<Record<string, string>> { return owner.attributes(); }
    })(input);
    return this.#delegate;
  }

  /** @internal Bun runtime lifecycle boundary. */
  async [BUN_FORM_REQUEST_INITIALIZE](
    context: BunHttpContext,
    sources: BunFormRequestSources,
    input: BunFormRequestInput,
  ): Promise<BunFormRequestInitialization<TValidated>> {
    if (this.#initialized || this.#context) {
      throw new BunFormRequestError("A Form Request instance cannot be initialized more than once.");
    }
    this.#context = context;
    this.#sources = sources;
    this.#input = { ...input };
    this.#preparing = true;
    try {
      await this.prepareForValidation();
    } finally {
      this.#preparing = false;
    }
    this.#input = Object.freeze({ ...this.#input });
    this.#initialized = true;
    if (!await this.authorize()) return Object.freeze({ authorized: false });
    const result = await this.validateAsync();
    if (result.valid) return Object.freeze({ authorized: true, result });
    const oldInput: Record<string, BunSessionValue> = {};
    for (const key of this.flashInput()) {
      if (typeof key !== "string" || key.length === 0) throw new BunFormRequestError("Form Request flash-input fields must be non-empty strings.");
      const value = this.#input[key];
      if (value === undefined) continue;
      if (!isSessionValue(value)) throw new BunFormRequestError(`Form Request flash-input field ${JSON.stringify(key)} must be session-serializable.`);
      oldInput[key] = structuredClone(value);
    }
    return Object.freeze({ authorized: true, result, oldInput: Object.freeze(oldInput) });
  }
}

export const Request = defineManagedClassDecorator<
  void,
  BunRequestClassMetadata,
  "bun.request.decorator"
>({
  id: "bun.request.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/bun", exportName: "Request" },
  kind: BUN_REQUEST_KIND,
  createMetadata: () => REQUEST_METADATA,
  validateTarget: (target) => {
    if (!(target.prototype instanceof FormRequest)) {
      throw new BunFormRequestError(
        `Bun Request class "${target.name}" must extend FormRequest.`,
      );
    }
  },
});

export const BUN_REQUEST_BASE_CONTRACT_HANDLER = defineCompilerMetadataHandler({
  id: "bun.request-base-contract",
  data: Object.freeze({
    type: "bunwire.managed-class-base-contract" as const,
    classKindIds: Object.freeze([BUN_REQUEST_KIND.id]),
    baseClass: Object.freeze({ moduleSpecifier: "@bunwire/bun", exportName: "FormRequest" }),
  }),
});

export const BUN_REQUEST_PARAMETER_RESOLVER_HANDLER = defineCompilerMetadataHandler({
  id: "bun.request-parameter-resolver",
  data: Object.freeze({
    type: "bunwire.managed-class-parameter-resolver" as const,
    classKindIds: Object.freeze([BUN_REQUEST_KIND.id]),
    resolverId: BUN_FORM_REQUEST_RESOLVER_ID,
  }),
});
