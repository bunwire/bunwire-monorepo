export const BUNWIRE_VIRTUAL_MODULE_NAMESPACE = "virtual:bunwire" as const;
export const BUNWIRE_VIRTUAL_MODULE_PREFIX = `${BUNWIRE_VIRTUAL_MODULE_NAMESPACE}/` as const;
export const BUNWIRE_RESOLVED_VIRTUAL_MODULE_PREFIX = `\0${BUNWIRE_VIRTUAL_MODULE_PREFIX}` as const;
export const BUNWIRE_DISCOVERY_MODULE_ID = `${BUNWIRE_VIRTUAL_MODULE_PREFIX}discovery` as const;
export const BUNWIRE_REGISTRY_MODULE_ID = `${BUNWIRE_VIRTUAL_MODULE_PREFIX}registry` as const;
export const BUNWIRE_CLIENT_MODULE_ID = `${BUNWIRE_VIRTUAL_MODULE_PREFIX}client` as const;
export const BUNWIRE_RESOLVED_REGISTRY_MODULE_ID = `\0${BUNWIRE_REGISTRY_MODULE_ID}` as const;
export const BUNWIRE_RESOLVED_CLIENT_MODULE_ID = `\0${BUNWIRE_CLIENT_MODULE_ID}` as const;

export function isBunwireVirtualModuleId(id: string): boolean {
  return id.startsWith(BUNWIRE_VIRTUAL_MODULE_PREFIX);
}

export function resolveBunwireVirtualModuleId(id: string): string | undefined {
  if (!isBunwireVirtualModuleId(id)) {
    return undefined;
  }
  return `\0${id}`;
}
