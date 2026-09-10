import { CONTROLLER_KIND, defineClassKind, defineManagedClassDecorator, defineManagedClassAttachmentDecorator,
  defineAdapterCompilerDescriptor, defineCompilerMetadataHandler, type ManagedClassIdentityHandlerData } from "@bunwire/core";
export const WIDGET_KIND = defineClassKind({ id: "proof.widget", injectable: true, autoDiscover: true, analyzeConstructor: true, managedMethods: false, registry: true });
function metadata(input: { id: string }): { readonly id: string } {
  if (!input || typeof input.id !== "string" || !input.id) throw new Error("A literal nonempty id is required.");
  return Object.freeze({ id: input.id });
}
export const Widget = defineManagedClassDecorator<{ id: string }, { readonly id: string }, "proof.widget-decorator">({ id: "proof.widget-decorator", kind: WIDGET_KIND,
  compilerSymbol: { moduleSpecifier: "proof-attachments", exportName: "Widget" }, bare: false, createMetadata: metadata });
export const Mark = defineManagedClassAttachmentDecorator<{ id: string }, { readonly id: string }, "proof.mark">({ id: "proof.mark", allowedOn: [CONTROLLER_KIND],
  compilerSymbol: { moduleSpecifier: "proof-attachments", exportName: "Mark" }, createMetadata: metadata });
export const compiler = defineAdapterCompilerDescriptor({ id: "proof.attachments", classKinds: [WIDGET_KIND], classDecorators: [Widget.definition], classAttachments: [Mark.definition],
  metadataHandlers: [defineCompilerMetadataHandler({ id: "proof.identity", data: {
    type: "bunwire.managed-class-identity", classKindIds: [WIDGET_KIND.id, CONTROLLER_KIND.id],
    resolveIdentity: (input) => input.kindId === WIDGET_KIND.id ? (input.data as { id: string }).id : (input.attachments.find((entry) => entry.definitionId === Mark.definition.id)?.data as { id: string } | undefined)?.id,
  } satisfies ManagedClassIdentityHandlerData })],
});
