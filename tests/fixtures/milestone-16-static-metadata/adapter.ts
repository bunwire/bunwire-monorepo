import { Adapter, CONTROLLER_KIND, defineAdapterCompilerDescriptor, defineManagedMethodDecorator,
  defineManagedClassAttachmentDecorator, defineMethodKind, defineParameterInjector,
  createParameterResolverId, defineParameterResolver, defineRuntimeRegistryConsumer } from "@bunwire/core";
export const METHOD_KIND = defineMethodKind({ id: "static.method", allowedOn: [CONTROLLER_KIND], invocable: true });
export interface HandleOptions { name: string; extra?: Record<string, unknown> | undefined }
function options(input: HandleOptions): Readonly<HandleOptions> {
  if (!input || typeof input.name !== "string" || !input.name) throw new Error("A method name is required");
  return Object.freeze({ name: input.name, ...(input.hasOwnProperty("extra") ? { extra: input.extra } : {}) });
}
export const Handle = defineManagedMethodDecorator<HandleOptions, Readonly<HandleOptions>, "static.handle">({
  id: "static.handle", kind: METHOD_KIND, compilerSymbol: { moduleSpecifier: "proof-static", exportName: "Handle" }, createMetadata: options,
});
export const Framework = defineParameterInjector<{ key: string }, { key: string }, "static.framework">({
  id: "static.framework", resolverId: createParameterResolverId("static.framework"), compilerSymbol: { moduleSpecifier: "proof-static", exportName: "Framework" },
  createMetadata: (input) => { if (!input || typeof input.key !== "string" || !input.key) throw new Error("A framework key is required"); return Object.freeze({ key: input.key }); },
});
export const Tag = defineManagedClassAttachmentDecorator<{ id: string }, { id: string }, "static.tag">({
  id: "static.tag", allowedOn: [CONTROLLER_KIND], compilerSymbol: { moduleSpecifier: "proof-static", exportName: "Tag" },
  createMetadata: (input) => { if (!input || typeof input.id !== "string" || !input.id) throw new Error("An attachment id is required"); return Object.freeze({ id: input.id }); },
});
export const compiler = defineAdapterCompilerDescriptor({ id: "static.adapter", methodKinds: [METHOD_KIND],
  methodDecorators: [Handle.definition], parameterInjectors: [Framework.definition], classAttachments: [Tag.definition] });
export interface Host { handlers: Map<string, (args: readonly unknown[]) => Promise<unknown>> }
export class StaticAdapter extends Adapter<Host> {
  static readonly compiler = compiler;
  constructor() {
    super({ parameterResolvers: [defineParameterResolver({ id: "static.framework", resolve: ({ parameter }) => (parameter.data as { key: string }).key })],
      registryConsumers: [defineRuntimeRegistryConsumer<"static.consumer", Host>({ id: "static.consumer", consume(registry, context) {
        for (const plan of registry.methods) context.applicationContext.handlers.set((plan.data as { name: string }).name, (args) => context.invoke(plan, args));
      } })] });
  }
}
