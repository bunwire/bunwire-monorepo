import { freezeCompilerSymbolReference, type CompilerSymbolReference } from "../compiler/compiler-symbol.js";
import { createClassDecoratorId, isNamespacedIdentifier, type ClassDecoratorId, type NamespacedIdentifier } from "./identifiers.js";
import type { ManagedClassKind } from "./class-kind.js";
import { getManagedClassMetadata, type ManagedClassTarget } from "./metadata.js";
import type { ManagedClassRegistryEntry } from "../adapters/runtime-registry.js";

export interface ManagedClassAttachmentDecoratorDefinition<Options = unknown, Data = unknown, Id extends string = string> {
  readonly id: ClassDecoratorId<Id>;
  readonly compilerSymbol: CompilerSymbolReference;
  readonly allowedOn: readonly ManagedClassKind[];
  readonly createMetadata: (options: Options) => Data;
}
export interface ManagedClassAttachment<Data = unknown> {
  readonly target: ManagedClassTarget;
  readonly definition: ManagedClassAttachmentDecoratorDefinition<any, Data>;
  readonly data: Data;
}
export interface DefineManagedClassAttachmentDecoratorOptions<Options, Data, Id extends NamespacedIdentifier> {
  readonly id: Id;
  readonly compilerSymbol: CompilerSymbolReference;
  readonly allowedOn: readonly ManagedClassKind[];
  readonly createMetadata: (options: Options) => Data;
}
export type ManagedClassAttachmentDecorator<Options, Data, Id extends string = string> =
  ((options: Options) => ClassDecorator) & { readonly definition: ManagedClassAttachmentDecoratorDefinition<Options, Data, Id> };

const KEY = Symbol.for("@bunwire/core/managed-class-attachments");
const EMPTY: readonly ManagedClassAttachment[] = Object.freeze([]);
export function getManagedClassAttachments(target: ManagedClassTarget): readonly ManagedClassAttachment[] {
  return Object.getOwnPropertyDescriptor(target, KEY)?.value as readonly ManagedClassAttachment[] | undefined ?? EMPTY;
}
export function assertClassAttachmentDefinition(definition: ManagedClassAttachmentDecoratorDefinition<any, any>): void {
  if (!definition || !isNamespacedIdentifier(definition.id) || !Array.isArray(definition.allowedOn) || !definition.allowedOn.length
    || definition.allowedOn.some((kind) => !kind || !isNamespacedIdentifier(kind.id))
    || new Set(definition.allowedOn.map((kind) => kind.id)).size !== definition.allowedOn.length || typeof definition.createMetadata !== "function") {
    throw new TypeError("Managed class attachment definitions require a namespaced ID, allowed class kinds and metadata factory.");
  }
  freezeCompilerSymbolReference(definition.compilerSymbol, `Class attachment "${definition.id}"`);
}
/** Shared by managed-class registration and attachment decorators, supporting either order. */
export function assertClassAttachmentPlacement(target: ManagedClassTarget, kindId?: string): void {
  for (let parent = Object.getPrototypeOf(target) as ManagedClassTarget | null; parent && parent !== Function.prototype; parent = Object.getPrototypeOf(parent) as ManagedClassTarget | null) {
    if (getManagedClassAttachments(parent).length) throw new TypeError(`Class "${target.name}" cannot inherit managed class attachments.`);
  }
  for (const attachment of getManagedClassAttachments(target)) {
    if (kindId !== undefined && !attachment.definition.allowedOn.some((kind) => kind.id === kindId)) throw new TypeError(`Class attachment "${attachment.definition.id}" is not allowed on class kind "${kindId}".`);
  }
}
export function defineManagedClassAttachmentDecorator<Options, Data, const Id extends NamespacedIdentifier = NamespacedIdentifier>(
  options: DefineManagedClassAttachmentDecoratorOptions<Options, Data, Id>,
): ManagedClassAttachmentDecorator<Options, Data, Id> {
  const definition = Object.freeze({ id: createClassDecoratorId(options.id), compilerSymbol: freezeCompilerSymbolReference(options.compilerSymbol, "Class attachment"),
    allowedOn: Object.freeze([...options.allowedOn]), createMetadata: options.createMetadata });
  assertClassAttachmentDefinition(definition);
  const factory = ((input: Options): ClassDecorator => ((target: Function) => {
    const managedTarget = target as ManagedClassTarget;
    const existing = getManagedClassAttachments(managedTarget);
    if (existing.some((entry) => entry.definition.id === definition.id)) throw new TypeError(`Duplicate class attachment "${definition.id}" on "${target.name}".`);
    const kindId = getManagedClassMetadata(managedTarget)?.kindId;
    if (kindId && !definition.allowedOn.some((kind) => kind.id === kindId)) throw new TypeError(`Class attachment "${definition.id}" is not allowed on class kind "${kindId}".`);
    assertClassAttachmentPlacement(managedTarget, kindId);
    const attachment = Object.freeze({ target: managedTarget, definition, data: definition.createMetadata(input) });
    Object.defineProperty(target, KEY, { value: Object.freeze([...existing, attachment]), configurable: true, enumerable: false, writable: false });
  }) as ClassDecorator) as ManagedClassAttachmentDecorator<Options, Data, Id>;
  Object.defineProperty(factory, "definition", { value: definition, enumerable: true, writable: false });
  return factory;
}

function equalData(left: unknown, right: unknown, seen = new Map<object, object>()): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right)) return false;
  if (!Array.isArray(left) && [left, right].some((value) => ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) return false;
  if (seen.has(left)) return seen.get(left) === right;
  seen.set(left, right);
  const leftKeys = Reflect.ownKeys(left); const rightKeys = Reflect.ownKeys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => {
    const a = Object.getOwnPropertyDescriptor(left, key); const b = Object.getOwnPropertyDescriptor(right, key);
    return a && b && "value" in a && "value" in b && equalData(a.value, b.value, seen);
  });
}

/** Generated sidecar record; does not replace the canonical owning class record. */
export function defineManagedClassAttachment<Data>(input: ManagedClassAttachment<Data>): ManagedClassAttachment<Data> {
  const metadata = getManagedClassMetadata(input.target);
  if (!metadata) throw new TypeError("Class attachments require an own canonical managed-class decorator.");
  assertClassAttachmentPlacement(input.target, metadata.kindId);
  const own = getManagedClassAttachments(input.target).find((entry) => entry.definition === input.definition);
  if (!own || !equalData(own.data, input.data)) throw new TypeError(`Generated class attachment "${input.definition.id}" differs from its own decorator metadata.`);
  return Object.freeze({ target: input.target, definition: input.definition, data: own.data as Data });
}

export function validateClassAttachmentRegistry(classes: readonly ManagedClassRegistryEntry[], attachments: readonly ManagedClassAttachment[], definitions: readonly ManagedClassAttachmentDecoratorDefinition<any, any>[]): void {
  const seen = new Map<ManagedClassTarget, Set<string>>();
  for (const entry of attachments) {
    if (!entry || !Object.isFrozen(entry) || !definitions.includes(entry.definition)) throw new TypeError("Runtime class attachments must use canonical contributed definitions and frozen generated records.");
    const owner = classes.find((owner) => owner.target === entry.target);
    if (!owner || !entry.definition.allowedOn.includes(owner.kind)) throw new TypeError("Runtime class attachment has an invalid or unregistered owner.");
    const ids = seen.get(entry.target) ?? new Set<string>();
    if (ids.has(entry.definition.id)) throw new TypeError(`Duplicate runtime class attachment "${entry.definition.id}".`);
    ids.add(entry.definition.id); seen.set(entry.target, ids);
    defineManagedClassAttachment(entry);
  }
  for (const owner of classes) {
    assertClassAttachmentPlacement(owner.target, owner.kind.id);
    for (const own of getManagedClassAttachments(owner.target)) {
      if (!seen.get(owner.target)?.has(own.definition.id)) throw new TypeError(`Missing generated class attachment "${own.definition.id}" on "${owner.target.name}".`);
    }
  }
}
