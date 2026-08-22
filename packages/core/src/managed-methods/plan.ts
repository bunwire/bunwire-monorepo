import type { InvocationContext } from "../application/invocation-context.js";
import { isClassToken, isToken, type Constructable, type RuntimeToken } from "../container/tokens.js";
import { ManagedClassKindRegistry } from "../managed-classes/class-kind-registry.js";
import type { ManagedClassKind } from "../managed-classes/class-kind.js";
import { isNamespacedIdentifier } from "../managed-classes/identifiers.js";
import { getManagedClassMetadata } from "../managed-classes/metadata.js";
import { ManagedMethodPlanError } from "./errors.js";
import type { ParameterResolverId } from "./identifiers.js";
import type { ManagedMethodKind } from "./method-kind.js";
import type { ManagedMethodKindRegistry } from "./method-kind-registry.js";

interface IndexedMethodParameter {
  readonly methodIndex: number;
}

export interface TransportParameterPlan extends IndexedMethodParameter {
  readonly source: "transport";
  readonly argumentIndex: number;
  readonly optional: boolean;
  readonly rest?: boolean;
}

export interface ContainerParameterPlan extends IndexedMethodParameter {
  readonly source: "container";
  readonly token: RuntimeToken;
}

export interface ResolverParameterPlan<Data = unknown> extends IndexedMethodParameter {
  readonly source: "resolver";
  readonly resolverId: ParameterResolverId;
  readonly data?: Data;
}

export interface ContextParameterPlan extends IndexedMethodParameter {
  readonly source: "context";
}

export type ManagedMethodParameterPlan =
  | TransportParameterPlan
  | ContainerParameterPlan
  | ResolverParameterPlan
  | ContextParameterPlan;

export type ParameterSourceKind = ManagedMethodParameterPlan["source"];

export interface ManagedMethodInvocation {
  readonly plan: ManagedMethodPlan;
  readonly context: InvocationContext;
  readonly target: object;
  readonly arguments: readonly unknown[];
  readonly callerArguments: readonly unknown[];
}

export type ManagedMethodNext = () => Promise<unknown>;
export type ManagedMethodMiddleware = (
  invocation: ManagedMethodInvocation,
  next: ManagedMethodNext,
) => unknown | Promise<unknown>;

export interface ManagedMethodPlan<
  Target extends Constructable<object> = Constructable<object>,
  Data = unknown,
> {
  readonly kind: ManagedMethodKind;
  readonly ownerKind: ManagedClassKind;
  readonly target: Target;
  readonly method: PropertyKey;
  readonly data: Data;
  readonly parameters: readonly ManagedMethodParameterPlan[];
  readonly middleware: readonly ManagedMethodMiddleware[];
}

export interface DefineManagedMethodPlanOptions<
  Target extends Constructable<object>,
  Data,
> {
  readonly kind: ManagedMethodKind;
  readonly ownerKind: ManagedClassKind;
  readonly target: Target;
  readonly method: keyof InstanceType<Target> & PropertyKey;
  readonly data: Data;
  readonly parameters: readonly ManagedMethodParameterPlan[];
  readonly middleware?: readonly ManagedMethodMiddleware[];
}

function assertIndex(index: unknown, label: string): asserts index is number {
  if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0) {
    throw new ManagedMethodPlanError(`${label} must be a non-negative safe integer; received ${index}.`);
  }
}

function validateOwnerKind(plan: ManagedMethodPlan, ownerKind: ManagedClassKind): void {
  if (!ownerKind.managedMethods) {
    throw new ManagedMethodPlanError(
      `Owning class kind "${ownerKind.id}" does not allow managed methods.`,
    );
  }
  if (!plan.kind.allowedOn.includes(ownerKind.id)) {
    throw new ManagedMethodPlanError(
      `Managed method kind "${plan.kind.id}" is not allowed on owning class kind "${ownerKind.id}".`,
    );
  }
}

function validateManagedMethodPlanStructure(plan: ManagedMethodPlan): void {
  const targetMetadata = getManagedClassMetadata(plan.target);
  if (targetMetadata?.kindId !== plan.ownerKind.id) {
    throw new ManagedMethodPlanError(
      `Managed method target "${plan.target.name}" must have own metadata for class kind "${plan.ownerKind.id}".`,
    );
  }
  if (typeof plan.target.prototype[plan.method] !== "function") {
    throw new ManagedMethodPlanError(
      `Managed method "${String(plan.method)}" is not callable on target "${plan.target.name}".`,
    );
  }

  if (!Array.isArray(plan.parameters)) {
    throw new ManagedMethodPlanError(
      `Managed method "${String(plan.method)}" parameters must be an array.`,
    );
  }
  if (!Array.isArray(plan.middleware)) {
    throw new ManagedMethodPlanError(
      `Managed method "${String(plan.method)}" middleware must be an array.`,
    );
  }
  for (const middleware of plan.middleware) {
    if (typeof middleware !== "function") {
      throw new ManagedMethodPlanError(
        `Managed method "${String(plan.method)}" middleware entries must be callable.`,
      );
    }
  }

  const methodIndexes = new Set<number>();
  const argumentIndexes = new Set<number>();
  let restParameter: { readonly methodIndex: number; readonly argumentIndex: number } | undefined;
  for (const rawParameter of plan.parameters as readonly unknown[]) {
    if (typeof rawParameter !== "object" || rawParameter === null) {
      throw new ManagedMethodPlanError(
        `Managed method "${String(plan.method)}" parameter entries must be objects.`,
      );
    }
    const parameter = rawParameter as Record<string, unknown>;
    assertIndex(parameter.methodIndex, "Method parameter index");
    if (methodIndexes.has(parameter.methodIndex)) {
      throw new ManagedMethodPlanError(
        `Managed method "${String(plan.method)}" contains duplicate method index ${parameter.methodIndex}.`,
      );
    }
    methodIndexes.add(parameter.methodIndex);

    switch (parameter.source) {
      case "transport":
        assertIndex(parameter.argumentIndex, "Caller argument index");
        if (typeof parameter.optional !== "boolean") {
          throw new ManagedMethodPlanError(
            `Managed method "${String(plan.method)}" transport parameter at method index ${parameter.methodIndex} must declare a boolean optional value.`,
          );
        }
        if (parameter.rest !== undefined && typeof parameter.rest !== "boolean") {
          throw new ManagedMethodPlanError(
            `Managed method "${String(plan.method)}" transport parameter at method index ${parameter.methodIndex} must declare a boolean rest value when present.`,
          );
        }
        if (parameter.rest === true) {
          if (restParameter) {
            throw new ManagedMethodPlanError(
              `Managed method "${String(plan.method)}" may contain only one caller-visible rest parameter.`,
            );
          }
          restParameter = {
            methodIndex: parameter.methodIndex as number,
            argumentIndex: parameter.argumentIndex as number,
          };
        }
        if (argumentIndexes.has(parameter.argumentIndex)) {
          throw new ManagedMethodPlanError(
            `Managed method "${String(plan.method)}" contains duplicate caller argument index ${parameter.argumentIndex}.`,
          );
        }
        argumentIndexes.add(parameter.argumentIndex);
        break;
      case "container":
        if (!isToken(parameter.token) && !isClassToken(parameter.token)) {
          throw new ManagedMethodPlanError(
            `Managed method "${String(plan.method)}" container parameter at method index ${parameter.methodIndex} must declare a valid runtime token.`,
          );
        }
        break;
      case "resolver":
        if (!isNamespacedIdentifier(parameter.resolverId)) {
          throw new ManagedMethodPlanError(
            `Managed method "${String(plan.method)}" resolver parameter at method index ${parameter.methodIndex} must declare a namespaced resolver ID.`,
          );
        }
        break;
      case "context":
        break;
      default:
        throw new ManagedMethodPlanError(
          `Managed method "${String(plan.method)}" contains unknown parameter source "${String(parameter.source)}" at method index ${parameter.methodIndex}.`,
        );
    }
  }

  for (let index = 0; index < methodIndexes.size; index += 1) {
    if (!methodIndexes.has(index)) {
      throw new ManagedMethodPlanError(
        `Managed method "${String(plan.method)}" parameter plan is missing method index ${index}.`,
      );
    }
  }
  for (let index = 0; index < argumentIndexes.size; index += 1) {
    if (!argumentIndexes.has(index)) {
      throw new ManagedMethodPlanError(
        `Managed method "${String(plan.method)}" transport plan is missing caller argument index ${index}.`,
      );
    }
  }
  if (restParameter
    && (restParameter.methodIndex !== methodIndexes.size - 1
      || restParameter.argumentIndex !== argumentIndexes.size - 1)) {
    throw new ManagedMethodPlanError(
      `Managed method "${String(plan.method)}" caller-visible rest parameter must be the final method and caller parameter.`,
    );
  }
}

export function validateManagedMethodPlan(
  plan: ManagedMethodPlan,
  classKinds: ManagedClassKindRegistry,
  methodKinds?: ManagedMethodKindRegistry,
): void {
  const canonicalOwnerKind = classKinds.get(plan.ownerKind.id);
  if (!canonicalOwnerKind) {
    throw new ManagedMethodPlanError(
      `Owning class kind "${plan.ownerKind.id}" is not registered for managed invocation.`,
    );
  }
  if (canonicalOwnerKind !== plan.ownerKind) {
    throw new ManagedMethodPlanError(
      `Owning class kind "${plan.ownerKind.id}" does not use the canonical registered descriptor.`,
    );
  }
  const canonicalMethodKind = methodKinds?.get(plan.kind.id);
  if (!canonicalMethodKind) {
    throw new ManagedMethodPlanError(
      `Managed method kind "${plan.kind.id}" is not registered for managed invocation.`,
    );
  }
  if (canonicalMethodKind !== plan.kind) {
    throw new ManagedMethodPlanError(
      `Managed method kind "${plan.kind.id}" does not use the canonical registered descriptor.`,
    );
  }
  validateOwnerKind(plan, canonicalOwnerKind);
  validateManagedMethodPlanStructure(plan);
}

export function defineManagedMethodPlan<
  Target extends Constructable<object>,
  Data,
>(
  options: DefineManagedMethodPlanOptions<Target, Data>,
): ManagedMethodPlan<Target, Data> {
  const plan = {
    kind: options.kind,
    ownerKind: options.ownerKind,
    target: options.target,
    method: options.method,
    data: options.data,
    parameters: Object.freeze(options.parameters.map((parameter) => Object.freeze({ ...parameter }))),
    middleware: Object.freeze([...(options.middleware ?? [])]),
  } satisfies ManagedMethodPlan<Target, Data>;

  validateOwnerKind(plan, plan.ownerKind);
  validateManagedMethodPlanStructure(plan);
  return Object.freeze(plan);
}
