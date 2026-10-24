import { Adapter, defineAdapterCompilerDescriptor, defineRuntimeRegistryConsumer, executeMiddlewareChain } from "@bunwire/core";
import { Handle, METHOD_KIND } from "../milestone-16-static-metadata/adapter.js";
export const compiler = defineAdapterCompilerDescriptor({ id: "policy.adapter", methodKinds: [METHOD_KIND], methodDecorators: [Handle.definition] });
export interface Host { invoke?: () => Promise<unknown> }
export class PolicyAdapter extends Adapter<Host> {
  static readonly compiler = compiler;
  constructor() {
    super({ registryConsumers: [defineRuntimeRegistryConsumer<"policy.consumer", Host>({ id: "policy.consumer", consume(registry, consumer) {
      const plan = registry.methods[0]!;
      consumer.applicationContext.invoke = () => consumer.invoke(plan, [], { around: (invocation, next) => executeMiddlewareChain({
        invocation, attachments: plan.middleware,
        createContext: (attachment) => Object.freeze({ parameters: attachment.parameters }), terminal: next,
      }) });
    } })] });
  }
}
