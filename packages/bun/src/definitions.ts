import { defineAdapterCompilerDescriptor } from "@bunwire/core";
import {
  BUN_HTTP_NO_CALLER_CONTRACT_HANDLER,
  BUN_HTTP_ROUTE_IDENTITY_HANDLER,
  BUN_HTTP_ROUTE_KIND,
  Context,
  Delete,
  Get,
  Head,
  Options,
  Patch,
  Post,
  Put,
} from "./http.js";

export const BUN_COMPILER_DESCRIPTOR = defineAdapterCompilerDescriptor({
  id: "bun.adapter",
  methodKinds: [BUN_HTTP_ROUTE_KIND],
  methodDecorators: [
    Get.definition,
    Post.definition,
    Put.definition,
    Patch.definition,
    Delete.definition,
    Options.definition,
    Head.definition,
  ],
  parameterInjectors: [Context.definition],
  metadataHandlers: [
    BUN_HTTP_ROUTE_IDENTITY_HANDLER,
    BUN_HTTP_NO_CALLER_CONTRACT_HANDLER,
  ],
});
