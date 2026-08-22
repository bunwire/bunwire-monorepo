import { isClassToken, isToken, type Constructable, type RuntimeToken } from "./tokens.js";

export interface ConstructorDependencyMetadata {
  readonly index: number;
  readonly token: RuntimeToken;
}

export interface ConstructorMetadata<Value = unknown> {
  readonly target: Constructable<Value>;
  readonly dependencies: readonly ConstructorDependencyMetadata[];
}

export function normalizeConstructorMetadata<Value>(
  metadata: ConstructorMetadata<Value>,
): ConstructorMetadata<Value> {
  const indexes = new Set<number>();
  for (const dependency of metadata.dependencies) {
    if (!Number.isSafeInteger(dependency.index) || dependency.index < 0) {
      throw new TypeError(
        `Constructor dependency index for "${metadata.target.name}" must be a non-negative safe integer; received ${dependency.index}.`,
      );
    }
    if (indexes.has(dependency.index)) {
      throw new TypeError(
        `Constructor metadata for "${metadata.target.name}" contains duplicate dependency index ${dependency.index}.`,
      );
    }
    if (!isToken(dependency.token) && !isClassToken(dependency.token)) {
      throw new TypeError(
        `Constructor dependency ${dependency.index} for "${metadata.target.name}" must declare a valid runtime token.`,
      );
    }
    indexes.add(dependency.index);
  }

  return Object.freeze({
    target: metadata.target,
    dependencies: Object.freeze(
      [...metadata.dependencies]
        .sort((left, right) => left.index - right.index)
        .map((dependency) => Object.freeze({ ...dependency })),
    ),
  });
}
