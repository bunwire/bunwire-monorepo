export const BUN_PAGE_REQUEST_HEADER = "X-Bunwire-Page" as const;
export const BUN_PAGE_RESPONSE_HEADER = "X-Bunwire-Page" as const;
export const BUN_PAGE_VERSION_HEADER = "X-Bunwire-Version" as const;
export const BUN_PAGE_LOCATION_HEADER = "X-Bunwire-Location" as const;
export const BUN_PAGE_PROTOCOL_VERSION = 1 as const;

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
}
