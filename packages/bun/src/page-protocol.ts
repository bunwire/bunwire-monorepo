export const BUN_PAGE_REQUEST_HEADER = "X-Bunwire-Page" as const;
export const BUN_PAGE_RESPONSE_HEADER = "X-Bunwire-Page" as const;
export const BUN_PAGE_VERSION_HEADER = "X-Bunwire-Version" as const;
export const BUN_PAGE_LOCATION_HEADER = "X-Bunwire-Location" as const;
export const BUN_PAGE_PROTOCOL_VERSION = 1 as const;
export const BUN_PAGE_CAPABILITY_HEADER = "X-Bunwire-Page-Protocol" as const;
export const BUN_PAGE_PARTIAL_COMPONENT_HEADER = "X-Bunwire-Partial-Component" as const;
export const BUN_PAGE_PARTIAL_PROPS_HEADER = "X-Bunwire-Partial-Props" as const;
export const BUN_PAGE_DEFERRED_PROPS_HEADER = "X-Bunwire-Deferred-Props" as const;

export type BunPageJsonValue =
  | null | boolean | number | string
  | readonly BunPageJsonValue[]
  | { readonly [key: string]: BunPageJsonValue };

export type BunPageProps = Readonly<Record<string, BunPageJsonValue>>;

export interface BunwirePage<Props extends object = BunPageProps> {
  readonly component: string;
  readonly props: Props;
  readonly url: string;
  readonly version?: string;
  /** Present only in negotiated protocol 2 responses. These keys update existing props. */
  readonly partial?: readonly string[];
  /** Present only in negotiated protocol 2 responses. These keys require follow-up requests. */
  readonly deferred?: readonly string[];
}

export interface BunPageManifest {
  readonly protocol: typeof BUN_PAGE_PROTOCOL_VERSION;
  readonly mode: "development" | "production";
  readonly components: readonly string[];
  readonly entry: string;
  readonly styles?: readonly string[];
  readonly version?: string;
  readonly assetRoot?: string;
  readonly assets?: readonly string[];
  /** Server-only module path produced by a separate Vite SSR build. */
  readonly serverEntry?: string;
}
