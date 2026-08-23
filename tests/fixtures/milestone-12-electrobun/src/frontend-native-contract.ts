import { Electroview } from "electrobun/view";
import {
  createBunwireClient,
  type BunwireClientSchema,
} from "../client.generated.js";
import type { UserResult } from "./bun/application.js";

const rpc = Electroview.defineRPC<BunwireClientSchema>({
  handlers: { requests: {}, messages: {} },
});
new Electroview({ rpc });

const client = createBunwireClient(rpc);
const user: Promise<UserResult> = client.request("users/get", "native", true);
client.message("users/deleted", "native");

void user;
