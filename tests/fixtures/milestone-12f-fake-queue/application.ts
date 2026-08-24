import { Inject, Provider, type Container, type InvocationContext } from "@bunwire/core";
import { Command, Consumer, Delivery, Event, type FakeQueueDelivery } from "@bunwire/fake-queue";
import {
  QUEUE_INVOCATION,
  type QueueInvocationValue,
  queueEvents,
} from "./middleware.js";

@Provider()
export class QueueInvocationProvider {
  register(_container: Container): void {}
  boot(context: InvocationContext): void {
    context.container.value(QUEUE_INVOCATION, Object.freeze({ id: context.id }));
    queueEvents.push(`boot:${context.id}`);
  }
}

@Consumer()
export class OrdersConsumer {
  @Command("orders.create")
  create(
    value: string,
    @Inject(QUEUE_INVOCATION) invocation: QueueInvocationValue,
    @Delivery() delivery: FakeQueueDelivery,
  ): string {
    queueEvents.push(`controller:${delivery.topic}:${delivery.transport}:${invocation.id}:${delivery.invocationId}:${delivery.host.name}`);
    return value;
  }

  @Command("orders.short")
  short(): string {
    queueEvents.push("controller:short");
    return "unreachable";
  }

  @Command("orders.failed")
  failed(): string { return "unreachable"; }

  @Event("orders.created")
  created(value: string, @Delivery() delivery: FakeQueueDelivery): string {
    queueEvents.push(`event-controller:${delivery.topic}:${value}`);
    return "ignored-by-host";
  }
}
