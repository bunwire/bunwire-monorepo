import type { ManagedClassKind } from "./class-kind.js";
import type { ClassKindId } from "./identifiers.js";

export class ManagedClassKindRegistry {
  readonly #kinds = new Map<ClassKindId, ManagedClassKind>();

  constructor(kinds: readonly ManagedClassKind[] = []) {
    for (const kind of kinds) {
      this.register(kind);
    }
  }

  register(kind: ManagedClassKind): this {
    const existing = this.#kinds.get(kind.id);
    if (existing === kind) {
      return this;
    }
    if (existing) {
      throw new TypeError(
        `Managed class kind ID "${kind.id}" is already registered with a different descriptor.`,
      );
    }
    this.#kinds.set(kind.id, kind);
    return this;
  }

  get(id: ClassKindId): ManagedClassKind | undefined {
    return this.#kinds.get(id);
  }
}
