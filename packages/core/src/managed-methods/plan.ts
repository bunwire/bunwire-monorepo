import type { InvocationContext } from "../application/invocation-context.js";
import type { Constructable, RuntimeToken } from "../container/tokens.js";
import type { ManagedClassKind } from "../managed-classes/class-kind.js";
import { getManagedClassMetadata } from "../managed-classes/metadata.js";
import { ManagedMethodPlanError } from "./errors.js";
import type { ParameterResolverId } from "./identifiers.js";
import type { ManagedMethodKind } from "./method-kind.js";

interface IndexedMethodParameter {
  readonly methodIndex: number;
}

export interface TransportParameterPlan extends IndexedMethodParameter {
  readonly source: "transport";
  readonly argumentIndex: number;
  readonly optional: boolean;
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

function assertIndex(index: number, label: string): void {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new ManagedMethodPlanError(`${label} must be a non-negative safe integer; received ${index}.`);
  }
}

export function validateManagedMethodPlan(plan: ManagedMethodPlan): void {
  if (!plan.ownerKind.managedMethods) {
    throw new ManagedMethodPlanError(
      `Owning class kind "${plan.ownerKind.id}" does not allow managed methods.`,
    );
  }
  if (!plan.kind.allowedOn.includes(plan.ownerKind.id)) {
    throw new ManagedMethodPlanError(
      `Managed method kind "${plan.kind.id}" is not allowed on owning class kind "${plan.ownerKind.id}".`,
    );
  }

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

  const methodIndexes = new Set<number>();
  const argumentIndexes = new Set<number>();
  for (const parameter of plan.parameters) {
    assertIndex(parameter.methodIndex, "Method parameter index");
    if (methodIndexes.has(parameter.methodIndex)) {
      throw new ManagedMethodPlanError(
        `Managed method "${String(plan.method)}" contains duplicate method index ${parameter.methodIndex}.`,
      );
    }
    methodIndexes.add(parameter.methodIndex);

    if (parameter.source === "transport") {
      assertIndex(parameter.argumentIndex, "Caller argument index");
      if (argumentIndexes.has(parameter.argumentIndex)) {
        throw new ManagedMethodPlanError(
          `Managed method "${String(plan.method)}" contains duplicate caller argument index ${parameter.argumentIndex}.`,
        );
      }
      argumentIndexes.add(parameter.argumentIndex);
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

  validateManagedMethodPlan(plan);
  return Object.freeze(plan);
}
