import {
  MIDDLEWARE_KIND,
  type ManagedMethodPlan,
  type MiddlewareAttachment,
  type MiddlewareClassMetadata,
  type MiddlewareConstructor,
  type RuntimeRegistry,
} from "@bunwire/core";
import type {
  ElectrobunContext,
  ElectrobunRPC,
  ElectrobunWebview,
  ElectrobunWindow,
} from "./runtime.js";

export type ElectrobunMiddlewareTransport = "request" | "message";

export interface ElectrobunMiddlewareContext {
  readonly endpoint: string;
  readonly transport: ElectrobunMiddlewareTransport;
  readonly window: ElectrobunWindow;
  readonly webview: ElectrobunWebview;
  readonly rpc: ElectrobunRPC;
  readonly args: readonly unknown[];
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

export interface ElectrobunMiddlewareRuntimeDefinition {
  readonly target: MiddlewareConstructor;
  readonly data: MiddlewareClassMetadata;
  readonly include: readonly CompiledPattern[] | undefined;
  readonly exclude: readonly CompiledPattern[] | undefined;
}

function middlewareLabel(target: MiddlewareConstructor): string {
  return target.name || "<anonymous>";
}

function normalizePattern(pattern: string, target: MiddlewareConstructor, field: "include" | "exclude"): readonly string[] {
  if (pattern.includes("\\")) {
    throw new TypeError(
      `Electrobun middleware "${middlewareLabel(target)}" ${field} pattern ${JSON.stringify(pattern)} must use '/' separators.`,
    );
  }
  const segments = pattern.split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new TypeError(
      `Electrobun middleware "${middlewareLabel(target)}" ${field} patterns must contain at least one path segment.`,
    );
  }
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new TypeError(
        `Electrobun middleware "${middlewareLabel(target)}" ${field} pattern ${JSON.stringify(pattern)} may not traverse with '.' or '..'.`,
      );
    }
    if (segment.includes("**") && segment !== "**") {
      throw new TypeError(
        `Electrobun middleware "${middlewareLabel(target)}" ${field} pattern ${JSON.stringify(pattern)} may use '**' only as a complete path segment.`,
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

function matchesCompiledPattern(pattern: CompiledPattern, endpoint: string): boolean {
  const endpointSegments = endpoint.split("/").filter(Boolean);
  const memo = new Map<string, boolean>();
  const matches = (patternIndex: number, endpointIndex: number): boolean => {
    const key = `${patternIndex}:${endpointIndex}`;
    const existing = memo.get(key);
    if (existing !== undefined) return existing;
    const segment = pattern.segments[patternIndex];
    let result: boolean;
    if (!segment) {
      result = endpointIndex === endpointSegments.length;
    } else if (segment.globstar) {
      result = matches(patternIndex + 1, endpointIndex)
        || (endpointIndex < endpointSegments.length && matches(patternIndex, endpointIndex + 1));
    } else {
      result = endpointIndex < endpointSegments.length
        && segment.matcher!.test(endpointSegments[endpointIndex]!)
        && matches(patternIndex + 1, endpointIndex + 1);
    }
    memo.set(key, result);
    return result;
  };
  return matches(0, 0);
}

function validateTransports(
  values: readonly string[] | undefined,
  field: "only" | "except",
  target: MiddlewareConstructor,
): void {
  for (const value of values ?? []) {
    if (value !== "request" && value !== "message") {
      throw new TypeError(
        `Electrobun middleware "${middlewareLabel(target)}" ${field} contains unsupported transport ${JSON.stringify(value)}; expected "request" or "message".`,
      );
    }
  }
}

export function createElectrobunMiddlewareDefinitions(
  registry: RuntimeRegistry,
  plans: readonly ManagedMethodPlan[],
): ReadonlyMap<MiddlewareConstructor, ElectrobunMiddlewareRuntimeDefinition> {
  const definitions = new Map<MiddlewareConstructor, ElectrobunMiddlewareRuntimeDefinition>();
  for (const entry of registry.classes) {
    if (entry.kind !== MIDDLEWARE_KIND) continue;
    const target = entry.target as MiddlewareConstructor;
    const data = entry.data as MiddlewareClassMetadata;
    validateTransports(data.only, "only", target);
    validateTransports(data.except, "except", target);
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
    for (const entry of plan.middleware) {
      if (typeof entry === "function") continue;
      if (!definitions.has(entry.target)) {
        throw new TypeError(
          `Electrobun managed method "${plan.target.name}.${String(plan.method)}" attaches middleware "${middlewareLabel(entry.target)}" without a runtime middleware definition.`,
        );
      }
    }
  }
  return definitions;
}

function appliesToEvent(
  definition: ElectrobunMiddlewareRuntimeDefinition,
  endpoint: string,
  transport: ElectrobunMiddlewareTransport,
): boolean {
  if (definition.include && !definition.include.some((pattern) => matchesCompiledPattern(pattern, endpoint))) {
    return false;
  }
  if (definition.exclude?.some((pattern) => matchesCompiledPattern(pattern, endpoint))) {
    return false;
  }
  if (definition.data.only && !definition.data.only.includes(transport)) {
    return false;
  }
  if (definition.data.except?.includes(transport)) {
    return false;
  }
  return true;
}

export function selectElectrobunMiddleware(
  plan: ManagedMethodPlan,
  definitions: ReadonlyMap<MiddlewareConstructor, ElectrobunMiddlewareRuntimeDefinition>,
  endpoint: string,
  transport: ElectrobunMiddlewareTransport,
): readonly MiddlewareAttachment[] {
  return Object.freeze(plan.middleware.flatMap((entry) => {
    if (typeof entry === "function") return [];
    const definition = definitions.get(entry.target);
    if (!definition) {
      throw new TypeError(`Electrobun middleware "${middlewareLabel(entry.target)}" has no validated runtime definition.`);
    }
    return appliesToEvent(definition, endpoint, transport) ? [entry] : [];
  }));
}

export function createElectrobunMiddlewareContext(
  native: ElectrobunContext,
  endpoint: string,
  transport: ElectrobunMiddlewareTransport,
  args: readonly unknown[],
  attachment: MiddlewareAttachment,
): ElectrobunMiddlewareContext {
  return Object.freeze({
    endpoint,
    transport,
    window: native.window,
    webview: native.webview,
    rpc: native.rpc,
    args: Object.freeze([...args]),
    parameters: attachment.parameters,
  });
}
