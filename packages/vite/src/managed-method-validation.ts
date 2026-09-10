import type { BunwireCompilerAnalysis } from "./compiler-analysis.js";
import type { ManagedClassIdentityHandlerData } from "@bunwire/core";
import { BunwireCompilerError } from "./diagnostics.js";
import type { DiscoveredCompilerExtensions } from "./extensions.js";

interface ManagedMethodIdentityInput {
  readonly ownerKindId: string;
  readonly ownerName: string;
  readonly ownerData: unknown;
  readonly methodKindId: string;
  readonly methodName: string;
  readonly methodData: unknown;
  readonly transportParameterCount: number;
}

interface ManagedMethodIdentityHandlerData {
  readonly type: "bunwire.managed-method-identity";
  readonly methodKindIds: readonly string[];
  readonly resolveIdentity: (input: ManagedMethodIdentityInput) => string;
}

function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function readHandlers(
  extensions: DiscoveredCompilerExtensions,
): readonly ManagedMethodIdentityHandlerData[] {
  const handlers: ManagedMethodIdentityHandlerData[] = [];
  const claimedKinds = new Set<string>();
  const registeredKinds = new Set<string>(extensions.adapter.methodKinds.map((kind) => kind.id));
  for (const handler of extensions.metadataHandlers) {
    if (!isObject(handler.data) || handler.data.type !== "bunwire.managed-method-identity") {
      continue;
    }
    const data = handler.data as Partial<ManagedMethodIdentityHandlerData>;
    if (!Array.isArray(data.methodKindIds) || typeof data.resolveIdentity !== "function") {
      throw new BunwireCompilerError(
        "REGISTRY_GENERATION_INVALID",
        `Managed-method identity handler "${handler.id}" is malformed.`,
      );
    }
    const localKinds = new Set<string>();
    for (const kindId of data.methodKindIds) {
      if (typeof kindId !== "string" || !registeredKinds.has(kindId)) {
        throw new BunwireCompilerError(
          "REGISTRY_GENERATION_INVALID",
          `Managed-method identity handler "${handler.id}" references unregistered method kind "${String(kindId)}".`,
        );
      }
      if (localKinds.has(kindId) || claimedKinds.has(kindId)) {
        throw new BunwireCompilerError(
          "REGISTRY_GENERATION_INVALID",
          `Managed method kind "${kindId}" is mapped by more than one identity-handler entry.`,
        );
      }
      localKinds.add(kindId);
      claimedKinds.add(kindId);
    }
    handlers.push(data as ManagedMethodIdentityHandlerData);
  }
  return handlers;
}

export function validateManagedMethodIdentities(
  analysis: BunwireCompilerAnalysis,
  extensions: DiscoveredCompilerExtensions,
): void {
  for (const contribution of extensions.metadataHandlers) {
    if (!isObject(contribution.data) || contribution.data.type !== "bunwire.managed-class-identity") continue;
    const handler = contribution.data as unknown as ManagedClassIdentityHandlerData;
    if (!Array.isArray(handler.classKindIds) || !handler.classKindIds.length || new Set(handler.classKindIds).size !== handler.classKindIds.length
      || handler.classKindIds.some((id) => !extensions.classKinds.some((kind) => kind.id === id)) || typeof handler.resolveIdentity !== "function"
      || (handler.reservedIdentities !== undefined && (!Array.isArray(handler.reservedIdentities)
        || handler.reservedIdentities.some((identity) => typeof identity !== "string" || !identity)
        || new Set(handler.reservedIdentities).size !== handler.reservedIdentities.length))) {
      throw new BunwireCompilerError("REGISTRY_GENERATION_INVALID", `Malformed managed-class identity handler "${contribution.id}".`);
    }
    const identities = new Map<string, string>();
    for (const owner of analysis.classes) {
      if (!handler.classKindIds.includes(owner.kind.id)) continue;
      let identity: string | undefined;
      try { identity = handler.resolveIdentity(Object.freeze({ kindId: owner.kind.id, name: owner.name, data: owner.data,
        attachments: Object.freeze((owner.attachments ?? []).map((entry) => Object.freeze({ definitionId: entry.definition.id, data: entry.data }))) })); }
      catch (cause) { throw new BunwireCompilerError("REGISTRY_GENERATION_INVALID", `Class identity for "${owner.name}" is invalid: ${cause instanceof Error ? cause.message : String(cause)}`, { cause, location: owner.location }); }
      if (identity === undefined) continue;
      if (typeof identity !== "string" || !identity) throw new BunwireCompilerError("REGISTRY_GENERATION_INVALID", `Class identity for "${owner.name}" must be a nonempty string or undefined.`, { location: owner.location });
      if (handler.reservedIdentities?.includes(identity)) {
        throw new BunwireCompilerError("REGISTRY_GENERATION_INVALID", `Managed class "${owner.name}" uses reserved identity "${identity}".`, { location: owner.location });
      }
      const previous = identities.get(identity);
      if (previous) throw new BunwireCompilerError("REGISTRY_GENERATION_INVALID", `Managed classes "${previous}" and "${owner.name}" have duplicate identity "${identity}".`, { location: owner.location });
      identities.set(identity, owner.name);
    }
  }
  for (const handler of readHandlers(extensions)) {
    const kinds = new Set(handler.methodKindIds);
    const identities = new Map<string, string>();
    for (const owner of analysis.classes) {
      for (const method of owner.methods) {
        if (!kinds.has(method.kind.id)) continue;
        let identity: string;
        try {
          identity = handler.resolveIdentity({
            ownerKindId: owner.kind.id,
            ownerName: owner.name,
            ownerData: owner.data,
            methodKindId: method.kind.id,
            methodName: method.name,
            methodData: method.data,
            transportParameterCount: method.parameters.filter((parameter) => (
              parameter.source === "transport"
            )).length,
          });
        } catch (cause) {
          throw new BunwireCompilerError(
            "REGISTRY_GENERATION_INVALID",
            `Managed method identity for "${owner.name}.${method.name}" could not be generated: ${cause instanceof Error ? cause.message : String(cause)}`,
            { location: method.location, cause },
          );
        }
        if (typeof identity !== "string" || identity.length === 0) {
          throw new BunwireCompilerError(
            "REGISTRY_GENERATION_INVALID",
            `Managed method identity for "${owner.name}.${method.name}" must be a non-empty string.`,
            { location: method.location },
          );
        }
        const existing = identities.get(identity);
        if (existing) {
          throw new BunwireCompilerError(
            "REGISTRY_GENERATION_INVALID",
            `Managed methods "${existing}" and "${owner.name}.${method.name}" have duplicate identity "${identity}".`,
            { location: method.location },
          );
        }
        identities.set(identity, `${owner.name}.${method.name}`);
      }
    }
  }
}
