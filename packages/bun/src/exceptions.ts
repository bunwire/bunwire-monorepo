import type {
  BunHttpContext,
  BunHttpRequest,
  BunHttpServer,
} from "./http.js";
import type { BunSessionValue } from "./sessions.js";

export type BunHttpMode = "production" | "development";
export type BunValidationErrors = Readonly<Record<string, readonly string[]>>;

export interface BunHttpExceptionContext {
  readonly request: BunHttpRequest;
  readonly server: BunHttpServer;
  readonly mode: BunHttpMode;
  readonly http?: BunHttpContext;
}

export interface BunHttpExceptionHandler {
  report(error: unknown, context: BunHttpExceptionContext): void | Promise<void>;
  render(error: unknown, context: BunHttpExceptionContext): Response | Promise<Response>;
}

export interface BunHttpExceptionOptions {
  readonly headers?: HeadersInit;
}

const STATUS_MESSAGES: Readonly<Record<number, string>> = Object.freeze({
  400: "Bad Request",
  401: "Unauthenticated",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  419: "CSRF Token Mismatch",
  422: "Validation Failed",
  500: "Internal Server Error",
  502: "Bad Gateway",
});

function statusMessage(status: number): string {
  return STATUS_MESSAGES[status] ?? "HTTP Error";
}

function freezeHeaders(input: HeadersInit | undefined): readonly (readonly [string, string])[] {
  if (input === undefined) return Object.freeze([]);
  return Object.freeze(Array.from(new Headers(input).entries(), ([name, value]) => (
    Object.freeze([name, value] as const)
  )));
}

export class BunHttpException extends Error {
  override readonly name: string = "BunHttpException";
  readonly status: number;
  readonly headers: readonly (readonly [string, string])[];

  constructor(
    status: number,
    message: string = statusMessage(status),
    options: BunHttpExceptionOptions = {},
  ) {
    if (!Number.isInteger(status) || status < 400 || status > 599) {
      throw new TypeError("Bun HTTP exception status must be an integer between 400 and 599.");
    }
    if (typeof message !== "string" || message.length === 0) {
      throw new TypeError("Bun HTTP exception message must be a non-empty string.");
    }
    super(message);
    this.status = status;
    this.headers = freezeHeaders(options.headers);
  }
}

export class BunNotFoundException extends BunHttpException {
  override readonly name = "BunNotFoundException";
  constructor(message = "Not Found") { super(404, message); }
}

export class BunMethodNotAllowedException extends BunHttpException {
  override readonly name = "BunMethodNotAllowedException";
  readonly allowedMethods: readonly string[];

  constructor(allowedMethods: readonly string[], message = "Method Not Allowed") {
    if (!Array.isArray(allowedMethods) || allowedMethods.some((method) => typeof method !== "string" || method.length === 0)) {
      throw new TypeError("Bun method-not-allowed methods must be an array of non-empty strings.");
    }
    const methods = Object.freeze([...allowedMethods]);
    super(405, message, { headers: { Allow: methods.join(", ") } });
    this.allowedMethods = methods;
  }
}

function freezeValidationErrors(errors: BunValidationErrors): BunValidationErrors {
  if (typeof errors !== "object" || errors === null || Array.isArray(errors)) {
    throw new TypeError("Bun validation errors must be a field-to-messages object.");
  }
  const entries = Object.entries(errors).map(([field, messages]) => {
    if (!Array.isArray(messages) || messages.some((message) => typeof message !== "string")) {
      throw new TypeError(`Bun validation errors for ${JSON.stringify(field)} must be an array of strings.`);
    }
    return [field, Object.freeze([...messages])] as const;
  });
  return Object.freeze(Object.fromEntries(entries));
}

export class BunValidationException extends BunHttpException {
  override readonly name = "BunValidationException";
  readonly errors: BunValidationErrors;
  readonly oldInput: Readonly<Record<string, BunSessionValue>>;

  constructor(
    errors: BunValidationErrors,
    message = "Validation Failed",
    oldInput: Readonly<Record<string, BunSessionValue>> = {},
  ) {
    super(422, message);
    this.errors = freezeValidationErrors(errors);
    this.oldInput = Object.freeze(structuredClone(oldInput));
  }
}

export class BunUnauthenticatedException extends BunHttpException {
  override readonly name = "BunUnauthenticatedException";
  constructor(message = "Unauthenticated") { super(401, message); }
}

export class BunAuthorizationException extends BunHttpException {
  override readonly name = "BunAuthorizationException";
  constructor(message = "Forbidden") { super(403, message); }
}

export class BunCsrfMismatchException extends BunHttpException {
  override readonly name = "BunCsrfMismatchException";
  constructor(message = "CSRF Token Mismatch") { super(419, message); }
}

function textResponse(body: string, status: number, headers?: HeadersInit): Response {
  const normalized = new Headers(headers);
  if (!normalized.has("Content-Type")) normalized.set("Content-Type", "text/plain; charset=utf-8");
  return new Response(body, { status, headers: normalized });
}

export function bunInternalServerError(): Response {
  return textResponse("Internal Server Error", 500);
}

export class BunDefaultHttpExceptionHandler implements BunHttpExceptionHandler {
  report(error: unknown, _context: BunHttpExceptionContext): void {
    if (!(error instanceof BunHttpException)) {
      console.error("Unhandled Bunwire HTTP request error.", error);
    }
  }

  render(error: unknown, context: BunHttpExceptionContext): Response {
    if (error instanceof BunValidationException) {
      return new Response(JSON.stringify({ message: error.message, errors: error.errors }), {
        status: error.status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    if (error instanceof BunHttpException) {
      return textResponse(
        error.message,
        error.status,
        error.headers.map(([name, value]) => [name, value] as [string, string]),
      );
    }
    if (context.mode === "development") {
      const details = error instanceof Error ? (error.stack ?? error.message) : String(error);
      return textResponse(`Internal Server Error\n\n${details}`, 500);
    }
    return bunInternalServerError();
  }
}

export function createBunHttpExceptionContext(
  request: BunHttpRequest,
  server: BunHttpServer,
  mode: BunHttpMode,
  http?: BunHttpContext,
): BunHttpExceptionContext {
  return Object.freeze({
    request,
    server,
    mode,
    ...(http === undefined ? {} : { http }),
  });
}

export async function handleBunHttpException(
  error: unknown,
  context: BunHttpExceptionContext,
  handler: BunHttpExceptionHandler,
): Promise<Response> {
  try {
    await handler.report(error, context);
  } catch {
    // Reporting is observational and must never replace or recursively render the request error.
  }
  try {
    const response = await handler.render(error, context);
    return response instanceof Response ? response : bunInternalServerError();
  } catch {
    return bunInternalServerError();
  }
}
