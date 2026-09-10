export type PathSegment = string | number;
export type Path = readonly PathSegment[];

export interface PathValue {
  present: boolean;
  value: unknown;
}

export interface RuleContext<TData = unknown> {
  readonly value: unknown;
  readonly present: boolean;
  readonly attribute: string;
  readonly path: Path;
  readonly data: TData;
  readonly arguments: readonly string[];
  readonly state: ValidationState;
  get(path: string | Path): PathValue;
}

export interface ValidationState {
  readonly errors: readonly ValidationError[];
  readonly values: Readonly<Record<string, unknown>>;
}

export interface RuleFailure {
  valid: false;
  message?: string;
  code?: string;
  parameters?: Readonly<Record<string, unknown>>;
  metadata?: unknown;
}

export interface RulePass {
  valid: true;
  /** Stop ordinary content rules; rules with `runsWhenSkipped` still execute. */
  skipRemaining?: boolean;
}

export type RuleOutcome = RulePass | RuleFailure;
export type RuleCaller<TData = unknown> = (context: RuleContext<TData>) => RuleOutcome | Promise<RuleOutcome>;

export interface Rule<TData = unknown> {
  readonly name: string;
  readonly caller: RuleCaller<TData>;
  readonly defaultMessage?: string;
  /** Execute when the field is absent (including `undefined`). */
  readonly runsOnAbsent?: boolean;
  /** Execute when the field is `null`. */
  readonly runsOnNull?: boolean;
  /** Execute after an earlier rule has skipped content validation. */
  readonly runsWhenSkipped?: boolean;
}

/** A programmatic use of a registered rule alias with pre-normalized arguments. */
export interface RuleInvocation {
  readonly alias: string;
  readonly arguments: readonly string[];
}

export type RuleEntry<TData = unknown> = string | Rule<TData> | RuleCaller<TData> | RuleInvocation;
export type RuleList<TData = unknown> = RuleEntry<TData> | readonly RuleEntry<TData>[];
export type RuleDefinitions<TData = unknown> = Readonly<Record<string, RuleList<TData>>>;
export type MessageMap = Readonly<Record<string, string>>;

export interface ValidationError {
  readonly attribute: string;
  readonly path: Path;
  readonly rule: string;
  readonly message: string;
  readonly arguments: readonly string[];
  readonly value: unknown;
  readonly code?: string;
  readonly metadata?: unknown;
}

export interface ValidValidationResult<T> {
  readonly valid: true;
  readonly data: T;
  readonly errors: ValidationErrorsLike;
}

export interface InvalidValidationResult {
  readonly valid: false;
  readonly errors: ValidationErrorsLike;
}

export type ValidationResult<T> = ValidValidationResult<T> | InvalidValidationResult;

export interface ValidationOptions {
  readonly messages?: MessageMap;
  readonly attributes?: Readonly<Record<string, string>>;
}

export interface ValidationErrorsLike {
  all(): readonly ValidationError[];
  get(path: string | Path): readonly ValidationError[];
  first(path: string | Path): ValidationError | undefined;
  has(path: string | Path): boolean;
  readonly size: number;
}
