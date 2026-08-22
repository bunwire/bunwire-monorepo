import {
  CONTROLLER_KIND,
  createParameterResolverId,
  defineAdapterCompilerDescriptor,
  defineManagedMethodDecorator,
  defineMethodKind,
  defineParameterInjector,
} from "@bunwire/core";

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

export const ELECTROBUN_COMPILER_DESCRIPTOR = defineAdapterCompilerDescriptor({
  id: "electrobun.adapter",
  methodKinds: [ELECTROBUN_ROUTE_KIND, ELECTROBUN_MESSAGE_KIND],
  methodDecorators: [Route.definition, Message.definition],
  parameterInjectors: [Window.definition, Webview.definition, Context.definition],
});
