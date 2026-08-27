export type BunwireCompilerErrorCode =
  | "CONFIG_NOT_FOUND"
  | "CONFIG_AMBIGUOUS"
  | "CONFIG_INVALID"
  | "CONFIG_PATH_OUTSIDE_ROOT"
  | "SOURCE_ROOT_NOT_FOUND"
  | "SOURCE_ROOT_INVALID"
  | "SOURCE_GRAPH_ESCAPE"
  | "BOOTSTRAP_NOT_FOUND"
  | "BOOTSTRAP_INVALID"
  | "ADAPTER_EXPRESSION_UNRESOLVABLE"
  | "ADAPTER_MODULE_UNRESOLVABLE"
  | "ADAPTER_EXPORT_INVALID"
  | "ADAPTER_DESCRIPTOR_INVALID"
  | "EXTENSION_CONFLICT"
  | "TYPESCRIPT_PROGRAM_ERROR"
  | "COMPILER_SYMBOL_INVALID"
  | "DECORATOR_IDENTITY_CONFLICT"
  | "MANAGED_CLASS_INVALID"
  | "MIDDLEWARE_CLASS_INVALID"
  | "MIDDLEWARE_METADATA_INVALID"
  | "MIDDLEWARE_ATTACHMENT_INVALID"
  | "MIDDLEWARE_POLICY_INVALID"
  | "MIDDLEWARE_GROUP_CYCLE"
  | "MIDDLEWARE_CONTROLLER_PATTERN_INVALID"
  | "EVENT_CLASS_INVALID"
  | "EVENT_ALIAS_INVALID"
  | "LISTENER_CLASS_INVALID"
  | "LISTENER_EVENT_INVALID"
  | "LISTENER_HANDLER_INVALID"
  | "CONSTRUCTOR_INJECTION_INVALID"
  | "CONSTRUCTOR_DEPENDENCY_CYCLE"
  | "MANAGED_METHOD_INVALID"
  | "PARAMETER_SOURCE_CONFLICT"
  | "DECORATOR_ARGUMENT_INVALID"
  | "REGISTRY_GENERATION_INVALID"
  | "VIRTUAL_MODULE_INVALID";

export interface BunwireSourceLocation {
  readonly filePath: string;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface BunwireCompilerErrorOptions {
  readonly filePath?: string;
  readonly location?: BunwireSourceLocation;
  readonly cause?: unknown;
}

export class BunwireCompilerError extends Error {
  readonly code: BunwireCompilerErrorCode;
  readonly filePath: string | undefined;
  readonly location: BunwireSourceLocation | undefined;

  constructor(
    code: BunwireCompilerErrorCode,
    message: string,
    options: BunwireCompilerErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "BunwireCompilerError";
    this.code = code;
    this.filePath = options.filePath ?? options.location?.filePath;
    this.location = options.location;
  }
}
