import type { InvocationContext } from "../application/invocation-context.js";
import {
  CONTROLLER_KIND,
  MIDDLEWARE_KIND,
  PROVIDER_KIND,
  SERVICE_KIND,
} from "../managed-classes/built-ins.js";
import type { ManagedClassKind } from "../managed-classes/class-kind.js";
import { ManagedClassKindRegistry } from "../managed-classes/class-kind-registry.js";
import { CallerArgumentError, ManagedMethodPlanError } from "./errors.js";
import type { ParameterResolverDefinition } from "./resolvers.js";
import { ParameterResolverRegistry } from "./resolvers.js";
import type { ManagedMethodKind } from "./method-kind.js";
import { ManagedMethodKindRegistry } from "./method-kind-registry.js";
import {
  validateManagedMethodPlan,
  type ManagedMethodInvocation,
  type ManagedMethodMiddleware,
  type ManagedMethodParameterPlan,
  type ManagedMethodPlan,
} from "./plan.js";

export type InvocationResult<Value = unknown> = Promise<Awaited<Value>>;

function callerArgumentBounds(parameters: readonly ManagedMethodParameterPlan[]): {
  readonly minimum: number;
  readonly maximum: number;
} {
  const transportParameters = parameters.filter((parameter) => parameter.source === "transport");
  const highestRequiredIndex = transportParameters.reduce(
    (highest, parameter) => parameter.optional
      ? highest
      : Math.max(highest, parameter.argumentIndex),
    -1,
  );
  return {
    minimum: highestRequiredIndex + 1,
    maximum: transportParameters.some((parameter) => parameter.rest === true)
      ? Number.POSITIVE_INFINITY
      : transportParameters.length,
  };
}

export class InvocationEngine {
  readonly #resolvers = new ParameterResolverRegistry();
  readonly #classKinds = new ManagedClassKindRegistry([
    SERVICE_KIND,
    CONTROLLER_KIND,
    PROVIDER_KIND,
    MIDDLEWARE_KIND,
  ]);
  readonly #methodKinds = new ManagedMethodKindRegistry();

  registerClassKind(kind: ManagedClassKind): this {
    this.#classKinds.register(kind);
    return this;
  }

  registerMethodKind(kind: ManagedMethodKind): this {
    this.#methodKinds.register(kind);
    return this;
  }

  registerResolver<Id extends string, Data>(
    definition: ParameterResolverDefinition<Id, Data>,
  ): this {
    this.#resolvers.register(definition);
    return this;
  }

  getClassKind(kind: ManagedClassKind["id"]): ManagedClassKind | undefined {
    return this.#classKinds.get(kind);
  }

  getMethodKind(kind: ManagedMethodKind["id"]): ManagedMethodKind | undefined {
    return this.#methodKinds.get(kind);
  }

  getResolver(
    resolverId: ParameterResolverDefinition["id"],
  ): ParameterResolverDefinition | undefined {
    return this.#resolvers.get(resolverId);
  }

  validate(plan: ManagedMethodPlan): void {
    validateManagedMethodPlan(plan, this.#classKinds, this.#methodKinds);
  }

  async invoke<Result = unknown>(
    plan: ManagedMethodPlan,
    context: InvocationContext,
    callerArguments: readonly unknown[],
  ): InvocationResult<Result> {
    this.validate(plan);
    if (!plan.kind.invocable) {
      throw new ManagedMethodPlanError(
        `Managed method kind "${plan.kind.id}" is metadata-only and cannot be invoked.`,
      );
    }

    const { minimum, maximum } = callerArgumentBounds(plan.parameters);
    if (callerArguments.length < minimum || callerArguments.length > maximum) {
      throw new CallerArgumentError(plan.method, minimum, maximum, callerArguments.length);
    }

    const argumentsList = Array.from<unknown>({ length: plan.parameters.length });
    const orderedParameters = [...plan.parameters]
      .sort((left, right) => left.methodIndex - right.methodIndex);

    for (const parameter of orderedParameters) {
      switch (parameter.source) {
        case "transport":
          if (parameter.rest === true) {
            argumentsList.splice(
              parameter.methodIndex,
              1,
              ...callerArguments.slice(parameter.argumentIndex),
            );
          } else {
            argumentsList[parameter.methodIndex] = callerArguments[parameter.argumentIndex];
          }
          break;
        case "container":
          argumentsList[parameter.methodIndex] = context.container.get(parameter.token);
          break;
        case "resolver":
          argumentsList[parameter.methodIndex] = await this.#resolvers.resolve(
            parameter.resolverId,
            { context, parameter, plan },
          );
          break;
        case "context":
          argumentsList[parameter.methodIndex] = context;
          break;
        default:
          throw new ManagedMethodPlanError(
            `Managed method "${String(plan.method)}" contains unknown parameter source "${String((parameter as { source?: unknown }).source)}".`,
          );
      }
    }

    const target = context.container.get(plan.target);
    const method = target[plan.method as keyof typeof target];
    if (typeof method !== "function") {
      throw new ManagedMethodPlanError(
        `Managed method "${String(plan.method)}" is not callable on the resolved target "${plan.target.name}".`,
      );
    }

    const invocation = Object.freeze({
      plan,
      context,
      target,
      arguments: Object.freeze(argumentsList),
      callerArguments: Object.freeze([...callerArguments]),
    }) satisfies ManagedMethodInvocation;

    const callableMiddleware = plan.middleware.filter(
      (entry): entry is ManagedMethodMiddleware => typeof entry === "function",
    );
    let activeMiddlewareIndex = -1;
    const dispatch = async (index: number): Promise<unknown> => {
      if (index <= activeMiddlewareIndex) {
        throw new Error("Managed method middleware next() may only be called once.");
      }
      activeMiddlewareIndex = index;
      const middleware = callableMiddleware[index];
      if (middleware) {
        return middleware(invocation, () => dispatch(index + 1));
      }
      return Reflect.apply(method, target, argumentsList);
    };

    return await dispatch(0) as Awaited<Result>;
  }
}
