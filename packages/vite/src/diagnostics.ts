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
  | "EXTENSION_CONFLICT";

export interface BunwireCompilerErrorOptions {
  readonly filePath?: string;
  readonly cause?: unknown;
}

export class BunwireCompilerError extends Error {
  readonly code: BunwireCompilerErrorCode;
  readonly filePath: string | undefined;

  constructor(
    code: BunwireCompilerErrorCode,
    message: string,
    options: BunwireCompilerErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "BunwireCompilerError";
    this.code = code;
    this.filePath = options.filePath;
  }
}
