declare const classKindIdBrand: unique symbol;
declare const classDecoratorIdBrand: unique symbol;

export type NamespacedIdentifier = `${string}.${string}`;

export type ClassKindId<Value extends string = string> = Value & {
  readonly [classKindIdBrand]: "ClassKindId";
};

export type ClassDecoratorId<Value extends string = string> = Value & {
  readonly [classDecoratorIdBrand]: "ClassDecoratorId";
};

const namespacedIdentifierPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

export function isNamespacedIdentifier(value: unknown): value is NamespacedIdentifier {
  return typeof value === "string" && namespacedIdentifierPattern.test(value);
}

export function assertNamespacedIdentifier(value: string, label: string): void {
  if (!isNamespacedIdentifier(value)) {
    throw new TypeError(
      `${label} "${value}" must be a stable, lowercase namespaced identifier such as "core.service".`,
    );
  }
}

export function createClassKindId<const Id extends NamespacedIdentifier>(id: Id): ClassKindId<Id> {
  assertNamespacedIdentifier(id, "Class-kind ID");
  return id as ClassKindId<Id>;
}

export function createClassDecoratorId<const Id extends NamespacedIdentifier>(
  id: Id,
): ClassDecoratorId<Id> {
  assertNamespacedIdentifier(id, "Class-decorator ID");
  return id as ClassDecoratorId<Id>;
}
