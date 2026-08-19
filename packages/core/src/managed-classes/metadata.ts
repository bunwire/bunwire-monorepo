import type { ClassDecoratorId, ClassKindId } from "./identifiers.js";

export type ManagedClassTarget<Instance = object> = abstract new (...args: any[]) => Instance;

/** Runtime-ready metadata: it deliberately contains no TypeScript AST or Vite objects. */
export interface ManagedClassMetadata<Data = unknown, Target extends ManagedClassTarget = ManagedClassTarget> {
  readonly decoratorId: ClassDecoratorId;
  readonly kindId: ClassKindId;
  readonly target: Target;
  readonly data: Data;
}

export const MANAGED_CLASS_METADATA = Symbol.for("@bunwire/core/managed-class-metadata");

type MetadataCarrier = ManagedClassTarget & {
  readonly [MANAGED_CLASS_METADATA]?: ManagedClassMetadata;
};

export function getManagedClassMetadata<Target extends ManagedClassTarget>(
  target: Target,
): ManagedClassMetadata<unknown, Target> | undefined {
  return (target as MetadataCarrier)[MANAGED_CLASS_METADATA] as
    | ManagedClassMetadata<unknown, Target>
    | undefined;
}

export function attachManagedClassMetadata(
  target: ManagedClassTarget,
  metadata: ManagedClassMetadata,
): void {
  const existing = getManagedClassMetadata(target);
  if (existing) {
    throw new Error(
      `Class "${target.name}" is already managed by decorator "${existing.decoratorId}" and cannot also use "${metadata.decoratorId}".`,
    );
  }

  Object.defineProperty(target, MANAGED_CLASS_METADATA, {
    configurable: false,
    enumerable: false,
    value: Object.freeze(metadata),
    writable: false,
  });
}
