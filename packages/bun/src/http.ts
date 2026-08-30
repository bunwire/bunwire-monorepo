import {
  CONTROLLER_KIND,
  createParameterResolverId,
  createToken,
  defineCompilerMetadataHandler,
  defineManagedMethodDecorator,
  defineMethodKind,
  defineParameterInjector,
  type ControllerClassMetadata,
  type NamespacedIdentifier,
  type Token,
} from "@bunwire/core";
import type { BunRequest, Server } from "bun";
import type { BunExecutionScope } from "./execution-scopes.js";

export const BUN_HTTP_METHODS = Object.freeze([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
] as const);

export type BunHttpMethod = typeof BUN_HTTP_METHODS[number];
export type BunHttpRequest = BunRequest<string>;
export type BunHttpServer = Server<unknown>;

export interface BunHttpRouteMetadata {
  readonly method: BunHttpMethod;
  readonly path: string;
}

export interface BunHttpRouteContext {
  readonly method: BunHttpMethod;
  readonly path: string;
  readonly params: Readonly<Record<string, string>>;
}

export interface BunHttpContext {
  readonly request: BunHttpRequest;
  readonly server: BunHttpServer;
  readonly route: BunHttpRouteContext;
  readonly scope: BunExecutionScope;
}

export type BunHttpServerCallback = (
  server: BunHttpServer,
) => void | Promise<void>;

export interface BunHttpServerOptions {
  readonly hostname?: string;
  readonly port?: number;
  readonly onServer?: BunHttpServerCallback;
}

export const BUN_HTTP_CONTEXT: Token<BunHttpContext> =
  createToken<BunHttpContext>("bunwire.bun.http-context");

export const BUN_HTTP_CONTEXT_RESOLVER_ID = createParameterResolverId("bun.http-context");

export const BUN_HTTP_ROUTE_KIND = defineMethodKind({
  id: "bun.http-route",
  allowedOn: [CONTROLLER_KIND],
  invocable: true,
});

function assertPathInput(value: string | undefined, label: string): string {
  if (value === undefined || value === "" || value === "/") return "";
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string when supplied.`);
  }
  if (value.includes("?") || value.includes("#") || value.includes("\\")) {
    throw new TypeError(`${label} cannot contain query, fragment, or backslash syntax.`);
  }
  if (value.includes("//")) {
    throw new TypeError(`${label} cannot contain duplicate path separators.`);
  }
  return value.replace(/^\/+|\/+$/g, "");
}

function validateSegments(segments: readonly string[], label: string): void {
  const parameters = new Set<string>();
  for (const [index, segment] of segments.entries()) {
    if (segment === "." || segment === "..") {
      throw new TypeError(`${label} cannot contain dot segments.`);
    }
    if (segment.length === 0) {
      throw new TypeError(`${label} cannot contain empty path segments.`);
    }
    if (segment.includes("*")) {
      if (segment !== "*" || index !== segments.length - 1) {
        throw new TypeError(`${label} wildcard must be the complete final path segment.`);
      }
      continue;
    }
    if (segment.startsWith(":")) {
      const parameter = segment.slice(1);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(parameter)) {
        throw new TypeError(`${label} contains malformed route parameter "${segment}".`);
      }
      if (parameters.has(parameter)) {
        throw new TypeError(`${label} contains duplicate route parameter ":${parameter}".`);
      }
      parameters.add(parameter);
    } else if (segment.includes(":")) {
      throw new TypeError(`${label} route parameters must occupy a complete path segment.`);
    }
  }
}

export function normalizeBunHttpPath(
  controllerPrefix?: string,
  methodPath?: string,
): string {
  const prefix = assertPathInput(controllerPrefix, "Bun HTTP Controller prefix");
  const route = assertPathInput(methodPath, "Bun HTTP route path");
  const segments = [prefix, route].filter((part) => part.length > 0).join("/").split("/").filter(Boolean);
  validateSegments(segments, "Bun HTTP route path");
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

export function bunHttpRouteConflictIdentity(path: string): string {
  return path.split("/").map((segment) => (
    segment.startsWith(":") ? ":" : segment
  )).join("/");
}

function routeMetadata(method: BunHttpMethod, path: string | undefined): BunHttpRouteMetadata {
  return Object.freeze({ method, path: normalizeBunHttpPath(undefined, path) });
}

function defineHttpMethod<const Method extends BunHttpMethod, const Id extends NamespacedIdentifier>(
  method: Method,
  id: Id,
  exportName: string,
) {
  return defineManagedMethodDecorator<string | undefined, BunHttpRouteMetadata, Id>({
    id,
    compilerSymbol: { moduleSpecifier: "@bunwire/bun", exportName },
    kind: BUN_HTTP_ROUTE_KIND,
    createMetadata: (path) => routeMetadata(method, path),
  });
}

export const Get = defineHttpMethod("GET", "bun.http-get.decorator", "Get");
export const Post = defineHttpMethod("POST", "bun.http-post.decorator", "Post");
export const Put = defineHttpMethod("PUT", "bun.http-put.decorator", "Put");
export const Patch = defineHttpMethod("PATCH", "bun.http-patch.decorator", "Patch");
export const Delete = defineHttpMethod("DELETE", "bun.http-delete.decorator", "Delete");
export const Options = defineHttpMethod("OPTIONS", "bun.http-options.decorator", "Options");
export const Head = defineHttpMethod("HEAD", "bun.http-head.decorator", "Head");

export const Context = defineParameterInjector<void, undefined, "bun.http-context.decorator">({
  id: "bun.http-context.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/bun", exportName: "Context" },
  resolverId: BUN_HTTP_CONTEXT_RESOLVER_ID,
  createMetadata: () => undefined,
});

interface BunManagedMethodIdentityInput {
  readonly ownerKindId: string;
  readonly ownerData: unknown;
  readonly methodData: unknown;
  readonly transportParameterCount: number;
}

export function bunHttpCompiledRoute(input: BunManagedMethodIdentityInput): {
  readonly method: BunHttpMethod;
  readonly path: string;
  readonly identity: string;
} {
  if (input.ownerKindId !== CONTROLLER_KIND.id) {
    throw new TypeError("Bun HTTP routes must belong to Core Controllers.");
  }
  const owner = input.ownerData as Partial<ControllerClassMetadata> | undefined;
  if (!owner || (owner.prefix !== undefined && typeof owner.prefix !== "string")) {
    throw new TypeError("Bun HTTP Controller metadata contains a malformed prefix.");
  }
  const route = input.methodData as Partial<BunHttpRouteMetadata> | undefined;
  if (!route
    || !BUN_HTTP_METHODS.includes(route.method as BunHttpMethod)
    || typeof route.path !== "string") {
    throw new TypeError("Bun HTTP method metadata is malformed or unsupported.");
  }
  if (input.transportParameterCount !== 0) {
    throw new TypeError(
      "Bun HTTP route methods cannot declare caller-visible parameters; use @Context() or container injection.",
    );
  }
  const path = normalizeBunHttpPath(owner.prefix, route.path);
  return Object.freeze({
    method: route.method as BunHttpMethod,
    path,
    identity: `${route.method}\0${bunHttpRouteConflictIdentity(path)}`,
  });
}

export const BUN_HTTP_ROUTE_IDENTITY_HANDLER = defineCompilerMetadataHandler({
  id: "bun.http-route-identity",
  data: Object.freeze({
    type: "bunwire.managed-method-identity" as const,
    methodKindIds: Object.freeze([BUN_HTTP_ROUTE_KIND.id]),
    resolveIdentity: (input: BunManagedMethodIdentityInput): string => (
      bunHttpCompiledRoute(input).identity
    ),
  }),
});

export const BUN_HTTP_NO_CALLER_CONTRACT_HANDLER = defineCompilerMetadataHandler({
  id: "bun.http-no-caller-contract",
  data: Object.freeze({
    type: "bunwire.no-caller-contract" as const,
    methodKindIds: Object.freeze([BUN_HTTP_ROUTE_KIND.id]),
  }),
});
