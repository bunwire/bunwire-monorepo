export {
  USE_DECORATOR_ID,
  Use,
  getManagedMethodMiddlewareMetadata,
  type UseDecorator,
  type UseDecoratorDefinition,
} from "./managed-methods/middleware-decorator.js";
export {
  assertCompilerSymbolReference,
  type CompilerSymbolReference,
} from "./compiler/compiler-symbol.js";
export {
  createClassDecoratorId,
  createClassKindId,
  type ClassDecoratorId,
  type ClassKindId,
  type NamespacedIdentifier,
} from "./managed-classes/identifiers.js";
export {
  defineClassKind,
  type ManagedClassKind,
  type ManagedClassKindDefinition,
} from "./managed-classes/class-kind.js";
export { ManagedClassKindRegistry } from "./managed-classes/class-kind-registry.js";
export {
  defineManagedClassDecorator,
  type DefineManagedClassDecoratorOptions,
  type ManagedClassDecorator,
  type ManagedClassDecoratorDefinition,
} from "./managed-classes/class-decorator.js";
export {
  getManagedClassMetadata,
  MANAGED_CLASS_METADATA,
  type ManagedClassMetadata,
  type ManagedClassTarget,
} from "./managed-classes/metadata.js";
export {
  CONTROLLER_KIND,
  Controller,
  MIDDLEWARE_KIND,
  PROVIDER_KIND,
  PROVIDER_LIFECYCLE_HOOKS,
  Provider,
  SERVICE_KIND,
  Service,
  type ControllerClassMetadata,
  type ProviderClassMetadata,
  type ProviderConstructorPolicy,
  type ProviderLifecycleHook,
  type ServiceClassMetadata,
  type ServiceOptions,
  type ServiceScope,
} from "./managed-classes/built-ins.js";
export {
  Middleware,
  assertMiddlewareTarget,
  defineMiddlewareAttachment,
  defineMiddlewareDefinition,
  validateMiddlewareAttachment,
  validateMiddlewareDefinition,
  type DefineMiddlewareDefinitionOptions,
  type MiddlewareAttachment,
  type MiddlewareClassMetadata,
  type MiddlewareConstructor,
  type MiddlewareDefinition,
  type MiddlewareNext,
} from "./middleware/managed-middleware.js";
export {
  executeMiddlewareChain,
  type ExecuteMiddlewareChainOptions,
  type MiddlewareContextFactory,
  type MiddlewareTerminal,
} from "./middleware/chain.js";
export {
  MiddlewareAttachmentError,
  MiddlewareDefinitionError,
  MiddlewareExecutionError,
  MiddlewareNextError,
} from "./middleware/errors.js";
export {
  createToken,
  describeToken,
  isClassToken,
  isToken,
  type ClassToken,
  type Constructable,
  type RuntimeToken,
  type Token,
} from "./container/tokens.js";
export {
  getInjectParameterMetadata,
  Inject,
  INJECT_DECORATOR_ID,
  INJECT_PARAMETER_METADATA,
  type InjectDecorator,
  type InjectDecoratorDefinition,
  type InjectParameterMetadata,
} from "./container/inject.js";
export {
  type ConstructorDependencyMetadata,
  type ConstructorMetadata,
} from "./container/metadata.js";
export {
  type AliasBinding,
  type Binding,
  type BindingFactory,
  type BindingScope,
  type ClassBinding,
  type FactoryBinding,
  type InstanceBinding,
  type ValueBinding,
} from "./container/bindings.js";
export { ContainerResolutionError } from "./container/errors.js";
export { Container } from "./container/container.js";
export {
  Application,
  defineApp,
  type ApplicationState,
} from "./application/application.js";
export { ApplicationStateError } from "./application/errors.js";
export {
  APPLICATION_CONTEXT,
  INVOCATION_CONTEXT,
  type InvocationContext,
  type ManagedInvocationAround,
  type ManagedInvocationContinuation,
  type ManagedInvocationOptions,
} from "./application/invocation-context.js";
export {
  defineProviderRegistry,
  type ConventionRegistration,
  type ProviderConstructor,
  type ProviderLifecycle,
  type ProviderRegistry,
} from "./application/registry.js";
export {
  createMethodKindId,
  createMethodDecoratorId,
  createParameterInjectorId,
  createParameterResolverId,
  type MethodDecoratorId,
  type MethodKindId,
  type ParameterInjectorId,
  type ParameterResolverId,
} from "./managed-methods/identifiers.js";
export {
  defineMethodKind,
  type ManagedMethodKind,
  type ManagedMethodKindDefinition,
} from "./managed-methods/method-kind.js";
export { ManagedMethodKindRegistry } from "./managed-methods/method-kind-registry.js";
export {
  defineManagedMethodDecorator,
  getManagedMethodMetadata,
  MANAGED_METHOD_METADATA,
  type DefineManagedMethodDecoratorOptions,
  type ManagedMethodDecorator,
  type ManagedMethodDecoratorDefinition,
  type ManagedMethodMetadata,
} from "./managed-methods/method-decorator.js";
export {
  defineParameterInjector,
  getParameterInjectorMetadata,
  PARAMETER_INJECTOR_METADATA,
  type DefineParameterInjectorOptions,
  type ParameterInjector,
  type ParameterInjectorDefinition,
  type ParameterInjectorMetadata,
} from "./managed-methods/parameter-injector.js";
export {
  defineManagedMethodPlan,
  validateManagedMethodPlan,
  type ContainerParameterPlan,
  type ContextParameterPlan,
  type DefineManagedMethodPlanOptions,
  type ManagedMethodInvocation,
  type ManagedMethodMiddleware,
  type ManagedMethodNext,
  type ManagedMethodParameterPlan,
  type ManagedMethodPlan,
  type ParameterSourceKind,
  type ResolverParameterPlan,
  type TransportParameterPlan,
} from "./managed-methods/plan.js";
export {
  defineParameterResolver,
  ParameterResolverRegistry,
  type DefineParameterResolverOptions,
  type ParameterResolutionRequest,
  type ParameterResolver,
  type ParameterResolverDefinition,
} from "./managed-methods/resolvers.js";
export {
  InvocationEngine,
  type InvocationResult,
} from "./managed-methods/invocation-engine.js";
export {
  CallerArgumentError,
  ManagedMethodPlanError,
  UnknownParameterResolverError,
} from "./managed-methods/errors.js";
export {
  createAdapterId,
  createAdapterValidationHookId,
  createCompilerMetadataHandlerId,
  createRegistryConsumerId,
  type AdapterId,
  type AdapterValidationHookId,
  type CompilerMetadataHandlerId,
  type RegistryConsumerId,
} from "./adapters/identifiers.js";
export {
  assertAdapterCompilerDescriptor,
  defineAdapterCompilerDescriptor,
  defineCompilerMetadataHandler,
  type AdapterCompilerDescriptor,
  type CompilerMetadataHandlerDescriptor,
  type DefineAdapterCompilerDescriptorOptions,
  type DefineCompilerMetadataHandlerOptions,
} from "./adapters/compiler-descriptor.js";
export {
  Adapter,
  defineAdapterValidationHook,
  type AdapterHostContext,
  type AdapterPreparationContext,
  type AdapterRuntimeDefinition,
  type AdapterValidationHookDefinition,
  type DefineAdapterValidationHookOptions,
  type NativeObjectConfigurationCallback,
} from "./adapters/adapter.js";
export {
  defineRuntimeRegistry,
  defineRuntimeRegistryConsumer,
  type DefineRuntimeRegistryConsumerOptions,
  type DefineRuntimeRegistryOptions,
  type ManagedClassRegistryEntry,
  type ManagedClassRegistryEntryInput,
  type RuntimeRegistry,
  type RuntimeRegistryConsumerContext,
  type RuntimeRegistryConsumerDefinition,
} from "./adapters/runtime-registry.js";
