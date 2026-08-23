import {
  CONTROLLER_KIND,
  createParameterResolverId,
  defineAdapterCompilerDescriptor,
  defineCompilerMetadataHandler,
  defineManagedMethodDecorator,
  defineMethodKind,
  defineParameterInjector,
} from "@bunwire/core";
import { normalizeElectrobunPath } from "./path.js";

export interface ElectrobunMethodMetadata {
  readonly path: string | undefined;
}

function methodMetadata(path: string | undefined): ElectrobunMethodMetadata {
  if (path !== undefined && (typeof path !== "string" || path.trim().length === 0)) {
    throw new TypeError("Electrobun managed-method paths must be non-empty strings when supplied.");
  }
  return Object.freeze({ path });
}

export const ELECTROBUN_ROUTE_KIND = defineMethodKind({
  id: "electrobun.route",
  allowedOn: [CONTROLLER_KIND],
  invocable: true,
});

export const ELECTROBUN_MESSAGE_KIND = defineMethodKind({
  id: "electrobun.message",
  allowedOn: [CONTROLLER_KIND],
  invocable: true,
});

export const Route = defineManagedMethodDecorator<string | undefined, ElectrobunMethodMetadata, "electrobun.route.decorator">({
  id: "electrobun.route.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/electrobun", exportName: "Route" },
  kind: ELECTROBUN_ROUTE_KIND,
  createMetadata: methodMetadata,
});

export const Message = defineManagedMethodDecorator<string | undefined, ElectrobunMethodMetadata, "electrobun.message.decorator">({
  id: "electrobun.message.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/electrobun", exportName: "Message" },
  kind: ELECTROBUN_MESSAGE_KIND,
  createMetadata: methodMetadata,
});

export const ELECTROBUN_WINDOW_RESOLVER_ID = createParameterResolverId("electrobun.window");
export const ELECTROBUN_WEBVIEW_RESOLVER_ID = createParameterResolverId("electrobun.webview");
export const ELECTROBUN_CONTEXT_RESOLVER_ID = createParameterResolverId("electrobun.context");

export const Window = defineParameterInjector<void, undefined, "electrobun.window.decorator">({
  id: "electrobun.window.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/electrobun", exportName: "Window" },
  resolverId: ELECTROBUN_WINDOW_RESOLVER_ID,
  createMetadata: () => undefined,
});

export const Webview = defineParameterInjector<void, undefined, "electrobun.webview.decorator">({
  id: "electrobun.webview.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/electrobun", exportName: "Webview" },
  resolverId: ELECTROBUN_WEBVIEW_RESOLVER_ID,
  createMetadata: () => undefined,
});

export const Context = defineParameterInjector<void, undefined, "electrobun.context.decorator">({
  id: "electrobun.context.decorator",
  compilerSymbol: { moduleSpecifier: "@bunwire/electrobun", exportName: "Context" },
  resolverId: ELECTROBUN_CONTEXT_RESOLVER_ID,
  createMetadata: () => undefined,
});

export const ELECTROBUN_CALLER_CONTRACT_HANDLER = defineCompilerMetadataHandler({
  id: "electrobun.caller-contract",
  data: Object.freeze({
    type: "bunwire.caller-contract" as const,
    factory: Object.freeze({
      moduleSpecifier: "@bunwire/electrobun",
      exportName: "createElectrobunClient",
    }),
    schema: Object.freeze({
      moduleSpecifier: "@bunwire/electrobun",
      exportName: "ElectrobunClientSchema",
    }),
    methods: Object.freeze([
      Object.freeze({ kindId: ELECTROBUN_ROUTE_KIND.id, mode: "request" as const }),
      Object.freeze({ kindId: ELECTROBUN_MESSAGE_KIND.id, mode: "message" as const }),
    ]),
    resolveEndpoint(input: {
      readonly ownerData: unknown;
      readonly methodData: unknown;
      readonly methodName: string;
    }): string {
      const owner = input.ownerData as { readonly prefix?: unknown } | undefined;
      const method = input.methodData as { readonly path?: unknown } | undefined;
      if (owner?.prefix !== undefined && typeof owner.prefix !== "string") {
        throw new TypeError("Electrobun Controller compiler metadata contains a non-string prefix.");
      }
      if (method?.path !== undefined && typeof method.path !== "string") {
        throw new TypeError("Electrobun method compiler metadata contains a non-string path.");
      }
      return normalizeElectrobunPath(owner?.prefix, method?.path, input.methodName);
    },
  }),
});

export const ELECTROBUN_COMPILER_DESCRIPTOR = defineAdapterCompilerDescriptor({
  id: "electrobun.adapter",
  methodKinds: [ELECTROBUN_ROUTE_KIND, ELECTROBUN_MESSAGE_KIND],
  methodDecorators: [Route.definition, Message.definition],
  parameterInjectors: [Window.definition, Webview.definition, Context.definition],
  metadataHandlers: [ELECTROBUN_CALLER_CONTRACT_HANDLER],
});
