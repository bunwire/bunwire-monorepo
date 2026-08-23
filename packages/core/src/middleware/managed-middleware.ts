import type { ConstructorDependencyMetadata } from "../container/metadata.js";
import { normalizeConstructorMetadata } from "../container/metadata.js";
import type { Constructable } from "../container/tokens.js";
import { defineManagedClassDecorator } from "../managed-classes/class-decorator.js";
import { MIDDLEWARE_KIND } from "../managed-classes/built-ins.js";
import { getManagedClassMetadata } from "../managed-classes/metadata.js";
import {
  MiddlewareAttachmentError,
  MiddlewareDefinitionError,
} from "./errors.js";

export type MiddlewareNext<Result = unknown> = () => Promise<Result>;

export interface Middleware<Context = unknown, Result = unknown> {
  handle(context: Context, next: MiddlewareNext<Result>): Promise<Result>;
}

export type MiddlewareConstructor<Context = unknown, Result = unknown> =
  Constructable<Middleware<Context, Result>>;

export interface MiddlewareClassMetadata {
  readonly scope: "transient";
  readonly alias?: string;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  readonly only?: readonly string[];
  readonly except?: readonly string[];
}

export interface MiddlewareDefinition<
  Target extends MiddlewareConstructor = MiddlewareConstructor,
> {
  readonly kind: typeof MIDDLEWARE_KIND;
  readonly target: Target;
  readonly data: MiddlewareClassMetadata;
  readonly scope: "transient";
  readonly dependencies: readonly ConstructorDependencyMetadata[];
}

export interface DefineMiddlewareDefinitionOptions<
  Target extends MiddlewareConstructor,
> {
  readonly target: Target;
  readonly data?: Omit<MiddlewareClassMetadata, "scope">;
  readonly dependencies?: readonly ConstructorDependencyMetadata[];
}

export interface MiddlewareAttachment<
  Target extends MiddlewareConstructor = MiddlewareConstructor,
> {
  readonly target: Target;
  readonly parameters: readonly string[];
}

const FILTER_KEYS = Object.freeze(["include", "exclude", "only", "except"] as const);

function middlewareName(target: unknown): string {
  return typeof target === "function" && target.name ? target.name : "<anonymous>";
}

export function assertMiddlewareTarget(
  target: unknown,
): asserts target is MiddlewareConstructor {
  if (typeof target !== "function") {
    throw new MiddlewareDefinitionError("Middleware target must be a constructable class.");
  }
  const metadata = getManagedClassMetadata(target as MiddlewareConstructor);
  if (metadata?.kindId !== MIDDLEWARE_KIND.id
    || metadata.decoratorId !== Middleware.definition.id) {
    throw new MiddlewareDefinitionError(
      `Middleware target "${middlewareName(target)}" must have own metadata from the canonical @Middleware() decorator.`,
    );
  }
  if (typeof (target as MiddlewareConstructor).prototype?.handle !== "function") {
    throw new MiddlewareDefinitionError(
      `Middleware target "${middlewareName(target)}" must define a callable instance handle(context, next) method.`,
    );
  }
}

function normalizeStringList(
  value: readonly string[] | undefined,
  label: string,
): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new MiddlewareDefinitionError(`${label} must be an array of non-empty strings.`);
  }
  const seen = new Set<string>();
  const normalized = value.map((entry) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new MiddlewareDefinitionError(`${label} must contain only non-empty strings.`);
    }
    if (seen.has(entry)) {
      throw new MiddlewareDefinitionError(`${label} contains duplicate value "${entry}".`);
    }
    seen.add(entry);
    return entry;
  });
  return Object.freeze(normalized);
}

function normalizeMiddlewareData(
  data: Omit<MiddlewareClassMetadata, "scope"> | undefined,
): MiddlewareClassMetadata {
  if (data?.alias !== undefined
    && (typeof data.alias !== "string" || data.alias.trim().length === 0)) {
    throw new MiddlewareDefinitionError("Middleware alias must be a non-empty string when present.");
  }
  if (data?.only !== undefined && data.except !== undefined) {
    throw new MiddlewareDefinitionError('Middleware metadata cannot declare both "only" and "except".');
  }
  return Object.freeze({
    scope: "transient" as const,
    ...(data?.alias === undefined ? {} : { alias: data.alias }),
    ...Object.fromEntries(FILTER_KEYS.flatMap((key) => {
      const value = normalizeStringList(data?.[key], `Middleware ${key}`);
      return value === undefined ? [] : [[key, value]];
    })),
  });
}

function assertFrozenStringList(value: unknown, label: string): void {
  if (!Array.isArray(value) || !Object.isFrozen(value)
    || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    throw new MiddlewareDefinitionError(`${label} must be an immutable array of non-empty strings.`);
  }
  if (new Set(value).size !== value.length) {
    throw new MiddlewareDefinitionError(`${label} must not contain duplicate values.`);
  }
}

export function validateMiddlewareDefinition(
  definition: unknown,
): asserts definition is MiddlewareDefinition {
  if (!definition || typeof definition !== "object") {
    throw new MiddlewareDefinitionError("Middleware definition must be an immutable object.");
  }
  const candidate = definition as Record<string, unknown>;
  if (!Object.isFrozen(definition)) {
    throw new MiddlewareDefinitionError("Middleware definition must be immutable.");
  }
  if (candidate.kind !== MIDDLEWARE_KIND) {
    throw new MiddlewareDefinitionError(
      `Middleware definition for "${middlewareName(candidate.target)}" must use the canonical "${MIDDLEWARE_KIND.id}" descriptor.`,
    );
  }
  assertMiddlewareTarget(candidate.target);
  if (candidate.scope !== "transient") {
    throw new MiddlewareDefinitionError(
      `Middleware definition for "${middlewareName(candidate.target)}" must use transient scope.`,
    );
  }
  if (!candidate.data || typeof candidate.data !== "object" || !Object.isFrozen(candidate.data)) {
    throw new MiddlewareDefinitionError(
      `Middleware definition for "${middlewareName(candidate.target)}" must contain immutable metadata.`,
    );
  }
  const data = candidate.data as Record<string, unknown>;
  if (data.scope !== "transient") {
    throw new MiddlewareDefinitionError("Middleware definition metadata must declare transient scope.");
  }
  if (data.alias !== undefined
    && (typeof data.alias !== "string" || data.alias.trim().length === 0)) {
    throw new MiddlewareDefinitionError("Middleware alias must be a non-empty string when present.");
  }
  if (data.only !== undefined && data.except !== undefined) {
    throw new MiddlewareDefinitionError('Middleware metadata cannot declare both "only" and "except".');
  }
  for (const key of FILTER_KEYS) {
    if (data[key] !== undefined) {
      assertFrozenStringList(data[key], `Middleware ${key}`);
    }
  }
  if (!Array.isArray(candidate.dependencies) || !Object.isFrozen(candidate.dependencies)) {
    throw new MiddlewareDefinitionError("Middleware constructor dependencies must be an immutable array.");
  }
  try {
    normalizeConstructorMetadata({
      target: candidate.target as MiddlewareConstructor,
      dependencies: candidate.dependencies as readonly ConstructorDependencyMetadata[],
    });
  } catch (error) {
    throw new MiddlewareDefinitionError(
      `Middleware definition for "${middlewareName(candidate.target)}" has malformed constructor dependencies: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function defineMiddlewareDefinition<
  Target extends MiddlewareConstructor,
>(options: DefineMiddlewareDefinitionOptions<Target>): MiddlewareDefinition<Target> {
  assertMiddlewareTarget(options.target);
  let dependencies: readonly ConstructorDependencyMetadata[];
  try {
    dependencies = normalizeConstructorMetadata({
      target: options.target,
      dependencies: options.dependencies ?? [],
    }).dependencies;
  } catch (error) {
    throw new MiddlewareDefinitionError(
      `Middleware definition for "${options.target.name}" has malformed constructor dependencies: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const definition = Object.freeze({
    kind: MIDDLEWARE_KIND,
    target: options.target,
    data: normalizeMiddlewareData(options.data),
    scope: "transient" as const,
    dependencies,
  });
  validateMiddlewareDefinition(definition);
  return definition;
}

export function validateMiddlewareAttachment(
  attachment: unknown,
): asserts attachment is MiddlewareAttachment {
  if (!attachment || typeof attachment !== "object" || !Object.isFrozen(attachment)) {
    throw new MiddlewareAttachmentError("Middleware attachment must be an immutable object.");
  }
  const candidate = attachment as Record<string, unknown>;
  try {
    assertMiddlewareTarget(candidate.target);
  } catch (error) {
    throw new MiddlewareAttachmentError(error instanceof Error ? error.message : String(error));
  }
  if (!Array.isArray(candidate.parameters) || !Object.isFrozen(candidate.parameters)) {
    throw new MiddlewareAttachmentError("Middleware attachment parameters must be an immutable array.");
  }
  for (const parameter of candidate.parameters) {
    if (typeof parameter !== "string" || parameter.trim().length === 0) {
      throw new MiddlewareAttachmentError(
        "Middleware attachment parameters must contain only non-empty strings.",
      );
    }
  }
}

export function defineMiddlewareAttachment<
  Target extends MiddlewareConstructor,
>(target: Target, parameters: readonly string[] = []): MiddlewareAttachment<Target> {
  const attachment = Object.freeze({
    target,
    parameters: Object.freeze([...parameters]),
  });
  validateMiddlewareAttachment(attachment);
  return attachment;
}

export const Middleware = defineManagedClassDecorator<
  void,
  MiddlewareClassMetadata,
  "core.middleware.decorator"
>({
  id: "core.middleware.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/core", exportName: "Middleware" },
  kind: MIDDLEWARE_KIND,
  createMetadata: () => Object.freeze({ scope: "transient" as const }),
  validateTarget: (target) => {
    if (typeof target.prototype?.handle !== "function") {
      throw new MiddlewareDefinitionError(
        `Middleware target "${middlewareName(target)}" must define a callable instance handle(context, next) method.`,
      );
    }
  },
});
