import {
  createBunwireClient,
  type BunwireClientSchema,
  type BunwireClientTransport,
} from "../../.bunwire/client.js";

export type ApplicationRpcSchema = BunwireClientSchema;

export function createApplicationClient(transport: BunwireClientTransport) {
  return createBunwireClient(transport);
}
