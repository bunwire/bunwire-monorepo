import { describe, expect, it } from "vitest";
import { Adapter, Controller, CONTROLLER_KIND, Service, defineApp, defineAdapterCompilerDescriptor, defineManagedClassAttachmentDecorator,
  defineManagedClassAttachment, defineRuntimeRegistry, getManagedClassAttachments, getManagedClassMetadata, type ManagedClassAttachment } from "@bunwire/core";

const Mark = defineManagedClassAttachmentDecorator<{ name: string }, { name: string }, "proof.mark">({ id: "proof.mark", allowedOn: [CONTROLLER_KIND],
  compilerSymbol: { moduleSpecifier: "proof-attachments", exportName: "Mark" }, createMetadata: ({ name }) => Object.freeze({ name }) });
class MarkAdapter extends Adapter {
  static readonly compiler = defineAdapterCompilerDescriptor({ id: "proof.attachments", classAttachments: [Mark.definition] });
  constructor() { super(); } protected override prepareHost(): object { return {}; }
}
function entry(target: new () => object) { return { target, kind: CONTROLLER_KIND, data: undefined, scope: "singleton" as const, dependencies: [] }; }
describe("supplementary managed-class attachments", () => {
  it("supports both decorator orders without replacing class metadata and validates generated sidecars", async () => {
    @Mark({ name: "first" }) @Controller() class First {}
    @Controller() @Mark({ name: "second" }) class Second {}
    expect(getManagedClassMetadata(First)?.kindId).toBe(CONTROLLER_KIND.id); expect(getManagedClassMetadata(Second)?.kindId).toBe(CONTROLLER_KIND.id);
    expect(Object.isFrozen(Mark.definition)).toBe(true); expect(Object.isFrozen(Mark.definition.allowedOn)).toBe(true);
    const attachments = [First, Second].map((target) => defineManagedClassAttachment({ target, definition: Mark.definition, data: getManagedClassAttachments(target)[0]!.data as { name: string } }));
    const app = defineApp().withAdapter(new MarkAdapter()).withRuntimeRegistry(defineRuntimeRegistry({ classes: [entry(First), entry(Second)], classAttachments: attachments }));
    await app.start(); await app.stop(); expect(Object.isFrozen(getManagedClassAttachments(First))).toBe(true);
  });
  it("rejects duplicate, wrong-kind and inherited attachments in either order", () => {
    @Controller() class Owner {} Mark({ name: "x" })(Owner);
    expect(() => Mark({ name: "other" })(Owner)).toThrow(/Duplicate/);
    @Service() class Wrong {} expect(() => Mark({ name: "x" })(Wrong)).toThrow(/not allowed/);
    class Before {} Mark({ name: "x" })(Before); expect(() => Service()(Before)).toThrow(/not allowed/);
    class Child extends Owner {} expect(() => Controller()(Child)).toThrow(/inherit/);
    expect(getManagedClassAttachments(Child)).toEqual([]);
  });
  it("rejects omitted, forged, duplicated and unknown generated records", async () => {
    @Controller() @Mark({ name: "x" }) class Owner {}
    const attachment = getManagedClassAttachments(Owner)[0]!;
    expect(() => defineManagedClassAttachment({ ...attachment, data: { name: "tampered" } })).toThrow(/differs/);
    const missing = defineApp().withAdapter(new MarkAdapter()).withRuntimeRegistry(defineRuntimeRegistry({ classes: [entry(Owner)] }));
    await expect(missing.start()).rejects.toThrow(/Missing generated/);
    const duplicate = defineApp().withAdapter(new MarkAdapter()).withRuntimeRegistry(defineRuntimeRegistry({ classes: [entry(Owner)], classAttachments: [attachment, attachment] }));
    await expect(duplicate.start()).rejects.toThrow(/Duplicate runtime/);
    const unknown = defineApp().withRuntimeRegistry(defineRuntimeRegistry({ classes: [entry(Owner)], classAttachments: [attachment] }));
    await expect(unknown.start()).rejects.toThrow(/canonical contributed/);
    class Plain {} expect(() => defineManagedClassAttachment({ ...attachment, target: Plain } as ManagedClassAttachment)).toThrow(/canonical managed-class/);
  });
  it("keeps absent sidecars compatible and rejects malformed attachment definitions", async () => {
    expect(defineRuntimeRegistry().classAttachments).toEqual([]);
    const { classAttachments: _ignored, ...oldRegistry } = defineRuntimeRegistry(); const app = defineApp().withRuntimeRegistry(oldRegistry); await app.start(); await app.stop();
    expect(() => defineAdapterCompilerDescriptor({ id: "proof.invalid", classAttachments: [Mark.definition, Mark.definition] })).toThrow(/more than once/);
    expect(() => defineManagedClassAttachmentDecorator({ id: "proof.empty", allowedOn: [], compilerSymbol: { moduleSpecifier: "proof", exportName: "Empty" }, createMetadata: () => ({}) })).toThrow(/allowed class kinds/);
  });
});
