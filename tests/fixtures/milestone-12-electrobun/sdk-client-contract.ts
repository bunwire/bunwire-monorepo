import { Electroview, type ElectrobunRPCSchema } from "electrobun/view";
import {
  createElectrobunClient,
  type ElectrobunClientSchema,
} from "@bunwire/electrobun";

interface Requests {
  "users/get": (id: string, includePosts?: boolean) => { readonly id: string };
}

interface Messages {
  "users/deleted": (id: string) => void;
}

type Schema = ElectrobunClientSchema<Requests, Messages>;
type Assert<Condition extends true> = Condition;
type Extends<Actual, Expected> = Actual extends Expected ? true : false;
type _GeneratedSchemaUsesNativeContract = Assert<Extends<Schema, ElectrobunRPCSchema>>;

const rpc = Electroview.defineRPC<Schema>({
  handlers: { requests: {}, messages: {} },
});
const client = createElectrobunClient(rpc);

void client.request("users/get", "42", true);
client.message("users/deleted", "42");
