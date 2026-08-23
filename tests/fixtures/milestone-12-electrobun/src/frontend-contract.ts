import type {
  Cache,
  UserResult,
  UserService,
} from "./bun/application.js";
import type { ElectrobunWindow } from "@bunwire/electrobun";
import {
  createBunwireClient,
  type BunwireClientTransport,
} from "../client.generated.js";

declare const transport: BunwireClientTransport;
declare const service: UserService;
declare const cache: Cache;
declare const window: ElectrobunWindow;

const client = createBunwireClient(transport);

const requiredOnly: Promise<UserResult> = client.request("users/get", "42");
const optionalIncluded: Promise<UserResult> = client.request("users/get", "42", true);
const arrayAndRest = client.request("users/deleteUsers", ["one", "two"], true, "audit", "admin");
const defaultBeforeRequired = client.request("users/defaulted", undefined, "required");
const noMessageResponse: void = client.message("users/deleted", "42");

void requiredOnly;
void optionalIncluded;
void arrayAndRest;
void defaultBeforeRequired;
void noMessageResponse;

// @ts-expect-error required caller argument is missing
client.request("users/get");
// @ts-expect-error managed-method auto-DI Service is not caller-visible
client.request("users/get", "42", service);
// @ts-expect-error explicit token-injected value is not caller-visible
client.request("users/get", "42", cache);
// @ts-expect-error adapter-injected native Window is not caller-visible
client.request("users/get", "42", window);
// @ts-expect-error fixed caller tuple rejects excessive arguments
client.request("users/get", "42", true, "extra");
// @ts-expect-error array-valued first argument remains one logical argument
client.request("users/deleteUsers", "one", true);
// @ts-expect-error a defaulted argument before a required argument keeps its caller position
client.request("users/defaulted", "required");
// @ts-expect-error message calls have no Promise/response contract
client.message("users/deleted", "42").then(() => undefined);
