import type { MethodKindId } from "./identifiers.js";
import type { ManagedMethodKind } from "./method-kind.js";
import { isNamespacedIdentifier } from "../managed-classes/identifiers.js";

export class ManagedMethodKindRegistry {
  readonly #kinds = new Map<MethodKindId, ManagedMethodKind>();

  constructor(kinds: readonly ManagedMethodKind[] = []) {
    for (const kind of kinds) {
      this.register(kind);
    }
  }

  register(kind: ManagedMethodKind): this {
    if (!kind || typeof kind !== "object" || !isNamespacedIdentifier(kind.id)
      || !Array.isArray(kind.allowedOn)
      || kind.allowedOn.some((owner) => !isNamespacedIdentifier(owner))
      || new Set(kind.allowedOn).size !== kind.allowedOn.length
      || typeof kind.invocable !== "boolean") {
      throw new TypeError("Managed method-kind descriptors are malformed; use defineMethodKind().");
    }
    const existing = this.#kinds.get(kind.id);
    if (existing === kind) {
      return this;
    }
    if (existing) {
      throw new TypeError(
        `Managed method kind ID "${kind.id}" is already registered with a different descriptor.`,
      );
    }
    this.#kinds.set(kind.id, kind);
    return this;
  }

  get(id: MethodKindId): ManagedMethodKind | undefined {
    return this.#kinds.get(id);
  }
}
