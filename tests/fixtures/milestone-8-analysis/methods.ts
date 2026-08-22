import { Inject, Service, createToken } from "@bunwire/core";
import { Consumer, FrameworkValue, Subscribe } from "./extensions.js";

export interface MethodCache {
  readonly key: string;
}

export const METHOD_CACHE = createToken<MethodCache>("method-cache");

@Service()
export class MethodUserService {}

export class PayloadDto {
  readonly value = "payload";
}

@Consumer("orders")
export class OrderConsumer {
  @Subscribe("orders.direct")
  direct(first: string, second: number): string {
    return `${first}:${second}`;
  }

  @Subscribe("orders.strict")
  strict(id: string, users: MethodUserService, name: string): string {
    return `${id}:${users.constructor.name}:${name}`;
  }

  @Subscribe("orders.interleaved")
  interleaved(
    id: string,
    users: MethodUserService,
    payload: PayloadDto,
    @Inject(METHOD_CACHE) cache: MethodCache,
    @FrameworkValue() framework: unknown,
    active?: boolean,
    ...tags: string[]
  ): unknown {
    return { id, users, payload, cache, framework, active, tags };
  }

  @Subscribe("orders.precedence")
  precedence(@FrameworkValue() users: MethodUserService): unknown {
    return users;
  }

  @Subscribe("orders.rest")
  rest(prefix: string, ...values: string[]): string {
    return `${prefix}:${values.join(",")}`;
  }

  ordinary(value: string): string {
    return value;
  }
}
