import {
  MIDDLEWARE_KIND,
  type ManagedMethodPlan,
  type MiddlewareAttachment,
  type MiddlewareClassMetadata,
  type MiddlewareConstructor,
  type RuntimeRegistry,
} from "@bunwire/core";
import {
  BUN_HTTP_METHODS,
  type BunHttpContext,
  type BunHttpMethod,
} from "./http.js";

export interface BunMiddlewareContext extends BunHttpContext {
  readonly path: string;
  readonly method: BunHttpMethod;
  readonly transport: "http";
  readonly parameters: readonly string[];
}

interface CompiledSegment {
  readonly globstar: boolean;
  readonly matcher?: RegExp;
}

interface CompiledPattern {
  readonly source: string;
  readonly segments: readonly CompiledSegment[];
}

export interface BunMiddlewareRuntimeDefinition {
  readonly target: MiddlewareConstructor;
  readonly data: MiddlewareClassMetadata;
  readonly include: readonly CompiledPattern[] | undefined;
  readonly exclude: readonly CompiledPattern[] | undefined;
}

function middlewareLabel(target: MiddlewareConstructor): string {
  return target.name || "<anonymous>";
}

function normalizePattern(
  pattern: string,
  target: MiddlewareConstructor,
  field: "include" | "exclude",
): readonly string[] {
  if (pattern.includes("\\")) {
    throw new TypeError(
      `Bun HTTP middleware "${middlewareLabel(target)}" ${field} pattern ${JSON.stringify(pattern)} must use '/' separators.`,
    );
  }
  if (pattern.includes("?") || pattern.includes("#")) {
    throw new TypeError(
      `Bun HTTP middleware "${middlewareLabel(target)}" ${field} pattern ${JSON.stringify(pattern)} cannot contain query or fragment syntax.`,
    );
  }
  const segments = pattern.split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new TypeError(
      `Bun HTTP middleware "${middlewareLabel(target)}" ${field} patterns must contain at least one path segment.`,
    );
  }
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new TypeError(
        `Bun HTTP middleware "${middlewareLabel(target)}" ${field} pattern ${JSON.stringify(pattern)} may not traverse with '.' or '..'.`,
      );
    }
    if (segment.includes("**") && segment !== "**") {
      throw new TypeError(
        `Bun HTTP middleware "${middlewareLabel(target)}" ${field} pattern ${JSON.stringify(pattern)} may use '**' only as a complete path segment.`,
      );
    }
  }
  return segments;
}

function compileSegment(segment: string): CompiledSegment {
  if (segment === "**") return Object.freeze({ globstar: true });
  let source = "^";
  for (const character of segment) {
    source += character === "*"
      ? "[^/]*"
      : character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return Object.freeze({ globstar: false, matcher: new RegExp(`${source}$`) });
}

function compilePattern(
  pattern: string,
  target: MiddlewareConstructor,
  field: "include" | "exclude",
): CompiledPattern {
  return Object.freeze({
    source: pattern,
    segments: Object.freeze(normalizePattern(pattern, target, field).map(compileSegment)),
  });
}

function matchesCompiledPattern(pattern: CompiledPattern, pathname: string): boolean {
  const pathSegments = pathname.split("/").filter(Boolean);
  const memo = new Map<string, boolean>();
  const matches = (patternIndex: number, pathIndex: number): boolean => {
    const key = `${patternIndex}:${pathIndex}`;
    const existing = memo.get(key);
    if (existing !== undefined) return existing;
    const segment = pattern.segments[patternIndex];
    let result: boolean;
    if (!segment) {
      result = pathIndex === pathSegments.length;
    } else if (segment.globstar) {
      result = matches(patternIndex + 1, pathIndex)
        || (pathIndex < pathSegments.length && matches(patternIndex, pathIndex + 1));
    } else {
      result = pathIndex < pathSegments.length
        && segment.matcher!.test(pathSegments[pathIndex]!)
        && matches(patternIndex + 1, pathIndex + 1);
    }
    memo.set(key, result);
    return result;
  };
  return matches(0, 0);
}

function validateMethods(
  values: readonly string[] | undefined,
  field: "only" | "except",
  target: MiddlewareConstructor,
): void {
  for (const value of values ?? []) {
    if (!BUN_HTTP_METHODS.includes(value as BunHttpMethod)) {
      throw new TypeError(
        `Bun HTTP middleware "${middlewareLabel(target)}" ${field} contains unsupported HTTP method ${JSON.stringify(value)}; expected an uppercase Bun HTTP method.`,
      );
    }
  }
}

export function createBunMiddlewareDefinitions(
  registry: RuntimeRegistry,
  plans: readonly ManagedMethodPlan[],
): ReadonlyMap<MiddlewareConstructor, BunMiddlewareRuntimeDefinition> {
  const definitions = new Map<MiddlewareConstructor, BunMiddlewareRuntimeDefinition>();
  for (const entry of registry.classes) {
    if (entry.kind !== MIDDLEWARE_KIND) continue;
    const target = entry.target as MiddlewareConstructor;
    const data = entry.data as MiddlewareClassMetadata;
    validateMethods(data.only, "only", target);
    validateMethods(data.except, "except", target);
    definitions.set(target, Object.freeze({
      target,
      data,
      include: data.include === undefined
        ? undefined
        : Object.freeze(data.include.map((pattern) => compilePattern(pattern, target, "include"))),
      exclude: data.exclude === undefined
        ? undefined
        : Object.freeze(data.exclude.map((pattern) => compilePattern(pattern, target, "exclude"))),
    }));
  }
  for (const plan of plans) {
    for (const attachment of plan.middleware) {
      if (!definitions.has(attachment.target)) {
        throw new TypeError(
          `Bun HTTP route "${plan.target.name}.${String(plan.method)}" attaches middleware "${middlewareLabel(attachment.target)}" without a runtime middleware definition.`,
        );
      }
    }
  }
  return definitions;
}

function appliesToRequest(
  definition: BunMiddlewareRuntimeDefinition,
  pathname: string,
  method: BunHttpMethod,
): boolean {
  if (definition.include
    && !definition.include.some((pattern) => matchesCompiledPattern(pattern, pathname))) {
    return false;
  }
  if (definition.exclude?.some((pattern) => matchesCompiledPattern(pattern, pathname))) {
    return false;
  }
  if (definition.data.only && !definition.data.only.includes(method)) return false;
  if (definition.data.except?.includes(method)) return false;
  return true;
}

export function selectBunMiddleware(
  plan: ManagedMethodPlan,
  definitions: ReadonlyMap<MiddlewareConstructor, BunMiddlewareRuntimeDefinition>,
  pathname: string,
  method: BunHttpMethod,
): readonly MiddlewareAttachment[] {
  return Object.freeze(plan.middleware.flatMap((attachment) => {
    const definition = definitions.get(attachment.target);
    if (!definition) {
      throw new TypeError(
        `Bun HTTP middleware "${middlewareLabel(attachment.target)}" has no validated runtime definition.`,
      );
    }
    return appliesToRequest(definition, pathname, method) ? [attachment] : [];
  }));
}

export function createBunMiddlewareContext(
  http: BunHttpContext,
  pathname: string,
  attachment: MiddlewareAttachment,
): BunMiddlewareContext {
  return Object.freeze({
    ...http,
    path: pathname,
    method: http.route.method,
    transport: "http" as const,
    parameters: attachment.parameters,
  });
}
