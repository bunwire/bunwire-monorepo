import type { InvocationContext } from "../application/invocation-context.js";
import { CONTROLLER_KIND, PROVIDER_KIND, SERVICE_KIND } from "../managed-classes/built-ins.js";
import type { ManagedClassKind } from "../managed-classes/class-kind.js";
import { ManagedClassKindRegistry } from "../managed-classes/class-kind-registry.js";
import { CallerArgumentError, ManagedMethodPlanError } from "./errors.js";
import type { ParameterResolverDefinition } from "./resolvers.js";
import { ParameterResolverRegistry } from "./resolvers.js";
import {
  validateManagedMethodPlan,
  type ManagedMethodInvocation,
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
    maximum: transportParameters.length,
  };
}

export class InvocationEngine {
  readonly #resolvers = new ParameterResolverRegistry();
  readonly #classKinds = new ManagedClassKindRegistry([
    SERVICE_KIND,
    CONTROLLER_KIND,
    PROVIDER_KIND,
  ]);

  registerClassKind(kind: ManagedClassKind): this {
    this.#classKinds.register(kind);
    return this;
  }

  registerResolver<Id extends string, Data>(
    definition: ParameterResolverDefinition<Id, Data>,
  ): this {
    this.#resolvers.register(definition);
    return this;
  }

  async invoke<Result = unknown>(
    plan: ManagedMethodPlan,
    context: InvocationContext,
    callerArguments: readonly unknown[],
  ): InvocationResult<Result> {
    validateManagedMethodPlan(plan, this.#classKinds);
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
          argumentsList[parameter.methodIndex] = callerArguments[parameter.argumentIndex];
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

    let activeMiddlewareIndex = -1;
    const dispatch = async (index: number): Promise<unknown> => {
      if (index <= activeMiddlewareIndex) {
        throw new Error("Managed method middleware next() may only be called once.");
      }
      activeMiddlewareIndex = index;
      const middleware = plan.middleware[index];
      if (middleware) {
        return middleware(invocation, () => dispatch(index + 1));
      }
      return Reflect.apply(method, target, argumentsList);
    };

    return await dispatch(0) as Awaited<Result>;
  }
}
