import { defineClassKind, defineMethodKind, defineManagedClassDecorator, defineCompilerMetadataHandler, defineAdapterCompilerDescriptor, type ManagedClassCompilationHandlerData } from "@bunwire/core";
export const TASK_KIND = defineClassKind({ id: "proof.task", injectable: true, autoDiscover: true, analyzeConstructor: true, managedMethods: true, registry: true });
export const PERFORM_KIND = defineMethodKind({ id: "proof.perform", allowedOn: [TASK_KIND], invocable: true });
export const Task = defineManagedClassDecorator({ id: "proof.task-decorator", kind: TASK_KIND,
  compilerSymbol: { moduleSpecifier: "test-intrinsic", exportName: "Task" }, createMetadata: () => ({ type: "proof" }) });
export const compiler = defineAdapterCompilerDescriptor({ id: "proof.adapter", classKinds: [TASK_KIND], classDecorators: [Task.definition], methodKinds: [PERFORM_KIND],
  metadataHandlers: [defineCompilerMetadataHandler({ id: "proof.compilation", data: {
    type: "bunwire.managed-class-compilation", classKindIds: [TASK_KIND.id], scope: "transient", properties: ["priority"],
    compileMetadata: (data, properties) => ({ ...data as object, priority: properties.priority ?? 1 }),
    intrinsicMethods: [{ name: "perform", kind: PERFORM_KIND, compilerSymbol: { moduleSpecifier: "test-intrinsic", exportName: "PERFORM_KIND" }, parameters: "payload-only" }],
  } satisfies ManagedClassCompilationHandlerData })],
});
