# `@bunwire/core`

Core is platform-independent. It defines generic managed-class metadata and the runtime dependency container; it has no Vite or Electrobun dependency.

## Managed class definitions

Use `defineClassKind()` to describe capabilities and `defineManagedClassDecorator()` to associate an outer decorator with that meaning. IDs must be stable lowercase namespaces such as `queue.consumer`. Every compiler-visible decorator or parameter injector also declares `compilerSymbol: { moduleSpecifier, exportName }`, identifying its canonical public TypeScript export. Vite authorizes that exact resolved symbol; IDs alone never authorize compiler behavior.

Core's built-in specializations use that same API:

- `@Service({ scope: "singleton" | "transient" })` describes injectable business/application classes. The default scope metadata is `singleton`; ordinary Service methods are not managed methods.
- `@Controller(prefix?)` describes injectable, registry-managed classes that may own adapter-defined managed methods. The optional prefix is retained as generic metadata for adapters.
- `@Provider()` describes registry-managed lifecycle classes with the known `register` and `boot` hooks. These hooks are lifecycle metadata, not ordinary managed methods or routes.

In v1 Bunwire constructs Providers with zero supplied constructor arguments and performs no Provider constructor injection. A Provider constructor must therefore be callable with zero arguments; optional, defaulted, and rest parameters are valid, while required parameters are rejected by the typed Provider registry. Dependencies and bindings needed during startup are handled through the framework-owned `register(container)` hook. Provider lifecycle execution begins in Milestone 4.

## Application and lifecycle

`defineApp()` returns an instantiated, unstarted `Application`. `withContext()`, `withProviderRegistry()`, `withProviders()`, and `withConventionBindings()` configure and return that same object without starting it. Configuration closes when `start()` begins.

`start()` creates the root `Container`, applies convention defaults, stores any manual context under `APPLICATION_CONTEXT`, constructs each distinct `@Provider()` class with zero arguments, and awaits every `register(rootContainer)` call. Convention defaults are staged first so explicit Provider bindings win through the container's last-binding-wins semantics. A second or concurrent `start()` call throws `ApplicationStateError`; startup is never repeated silently.

`runInvocation()` is the Core boundary used by later adapters and managed-method machinery. It is available only after startup completes. Each call creates a child container, stores its real `InvocationContext` under `INVOCATION_CONTEXT`, applies optional invocation-local configuration, runs each Provider `boot(context)`, and then calls the supplied handler. Child-local values are isolated, including across concurrent invocations, while inherited root singletons keep root identity.

## Managed methods and invocation plans

`defineMethodKind()` declares a stable method-kind ID, the managed class kinds on which it is allowed, and whether it is runtime-invocable. `defineManagedMethodPlan()` records the owning kind, target class, method, extension data, middleware, and every parameter's explicit source and real method index.

Plans support four parameter sources:

- `transport` — reads a separately indexed caller argument and records optional/rest semantics;
- `container` — resolves an explicit runtime token from the invocation container;
- `resolver` — invokes a registered, namespaced custom parameter resolver;
- `context` — supplies the framework `InvocationContext` directly.

Plan array order has no positional meaning. `methodIndex` reconstructs the real method argument list, while `argumentIndex` independently addresses the caller-visible argument list. Caller indexes must be contiguous; argument counts range from one past the highest required caller index through the total caller-visible count. A final caller-visible rest parameter removes the maximum bound and is expanded into the real invocation. This also handles a defaulted/optional caller position before a later required position.

`InvocationEngine` consumes the prebuilt plan without inspecting source or reclassifying parameters. It requires both the owning class kind and method kind to use their registered canonical descriptors, validates caller counts, resolves the declared sources, wraps the call in plan middleware, and returns a Promise-normalized result. `Application.invokeManagedMethod()` executes that engine through `runInvocation()`, preserving invocation scope and Provider boot ordering. Unknown method kinds, resolver IDs, and malformed plans fail with dedicated actionable errors.

`@Use()` accepts canonical middleware classes or alias strings on Controllers and their managed methods. The compiler resolves those references into immutable `{ target, parameters }` records; runtime plans never retain local alias strings. Parameterized strings use the first `:` as the boundary and `,` as the separator. Names and parameters are trimmed and parameters remain strings.

`ManagedMethodPlan.middleware` temporarily accepts canonical attachment records alongside historical callable middleware. Runtime plan validation checks every attachment through the managed-middleware boundary. `InvocationEngine` continues to execute callable entries only, leaving managed attachments inert until adapter integration is added in a later middleware milestone.

## Managed middleware foundation

`@Middleware()` opts a class into the canonical `core.middleware` managed kind. The decorator value and generic `Middleware<Context, Result>` contract intentionally share the same TypeScript name. Middleware classes are injectable, constructor-analyzed, registry-managed, unable to own managed methods, and always transient:

```ts
@Middleware()
class AuditMiddleware implements Middleware<AuditContext, string> {
  constructor(private readonly audit: AuditService) {}

  async handle(context: AuditContext, next: () => Promise<string>) {
    await this.audit.record(context);
    return next();
  }
}
```

`defineMiddlewareDefinition()` creates a canonical transient registry entry with immutable compiled metadata and indexed constructor dependencies. `defineMiddlewareAttachment()` creates an immutable `{ target, parameters }` record and preserves parameter strings exactly. Runtime validation rejects counterfeit decorators, malformed targets, non-transient definitions, invalid constructor metadata, and mutable or malformed attachments before execution.

`executeMiddlewareChain()` accepts canonical attachments, an existing `InvocationContext`, an adapter-supplied context factory, and a terminal continuation. It resolves every middleware instance from that invocation's child container, executes the declared around-chain order, supports short-circuiting and result transformation, and rejects repeated `next()` calls. Core stores filter metadata but never interprets adapter paths or transport names.

`ManagedInvocationOptions.around` wraps the terminal managed invocation after Provider `boot()`. This allows an adapter to run `executeMiddlewareChain()` around `invokeManagedMethod()` without creating a second invocation scope. The historical callable `ManagedMethodMiddleware` and method-only callback overload of `@Use()` remain temporary migration scaffolding until the later middleware redesign milestones remove them.

`Application.withMiddlewares(callback)` marks one compiler-owned middleware policy block during composition. It accepts exactly one function while the Application is configuring, rejects repeated or late calls, and intentionally never invokes or retains the callback at runtime. The callback receives the type-only `MiddlewarePolicyRegistry` surface: `use()`, `group()`, and `controllers()`. Generated or manually supplied runtime registries are authoritative; Core never rebuilds policy from application source.

Every engine owns a `ManagedClassKindRegistry` seeded with Service, Controller, Provider, and Middleware and a `ManagedMethodKindRegistry` for explicitly contributed method kinds. Applications register extensions through `withManagedClassKind()` and `withManagedMethodKind()` while still configuring; adapters register their declared contributions automatically. The same descriptor may be registered repeatedly, but a missing registration or different descriptor using the same ID is rejected before invocation. Runtime plan validation also checks all parameter discriminants and source-specific fields, boolean optionality, runtime tokens, resolver IDs, and middleware callability before execution.

## Adapters and extension descriptors

A runtime host adapter is a class instance extending `Adapter<Context>`. Its class declares an own static `compiler` descriptor created with `defineAdapterCompilerDescriptor()`, while its constructor passes runtime contributions to `super()`. This keeps compiler-visible class kinds, class/method decorators, parameter injectors, and metadata-handler descriptors independent from arbitrary instance configuration.

```ts
class QueueAdapter extends Adapter<QueueContext> {
  static readonly compiler = defineAdapterCompilerDescriptor({
    id: "queue.host",
    classKinds: [CONSUMER_KIND],
    classDecorators: [Consumer.definition],
    methodKinds: [SUBSCRIBE_KIND],
    methodDecorators: [Subscribe.definition],
    parameterInjectors: [Delivery.definition],
  });

  constructor() {
    super({
      providers: [QueueProvider],
      parameterResolvers: [DELIVERY_RESOLVER],
      registryConsumers: [QUEUE_REGISTRY_CONSUMER],
    });
  }
}

const app = defineApp().withAdapter(new QueueAdapter());
```

V1 permits one primary host adapter. `withAdapter()` requires an `Adapter` instance, attaches the same unstarted `Application`, registers contributions through the existing canonical registries, and rejects conflicting IDs rather than replacing descriptors. Class-kind, method-kind, parameter-injector/resolver, registry-consumer, validation-hook, and compiler-metadata IDs are stable lowercase namespaces.

Adapter startup extends the existing kernel ordering: Core creates the root container and applies convention defaults; the adapter prepares a native context without accepting managed traffic; Core stores that context as `APPLICATION_CONTEXT`; adapter validation hooks run; all application and adapter-owned Providers register; runtime registry consumers connect managed metadata; and the adapter completes host start. Only then does the Application enter `running`. Each host dispatch uses the existing `invokeManagedMethod()` boundary, so Provider boot, invocation scopes, caller validation, and parameter resolution retain their established order.

`defineRuntimeRegistry()` is the compiler/runtime contract for generated and prebuilt metadata. It carries managed class entries with scope and indexed constructor dependencies, a generated Provider list, and complete managed-method plans. Application startup validates canonical kind/decorator identities and malformed entries, registers constructor metadata and convention class bindings, then runs generated and explicitly contributed Providers through the same lifecycle. Registry consumers connect methods only after Provider registration. Runtime never scans source or reclassifies parameters.

The base `Adapter.prepareHost()` implements the manual escape hatch: if the application was configured with `withContext(existingContext)`, that exact context is used. Full adapters override `prepareHost()` to create native objects and may still explicitly honor the manual context path. Native configuration callbacks are adapter-owned typed callbacks and receive the actual host objects, not Core wrappers.

## Container

`Container` supports class, singleton, transient, value, factory, alias, and existing-instance bindings. Custom runtime identities come from `createToken<T>(description)`; concrete or abstract class constructors can also be tokens.

Constructor resolution is driven by explicit `registerConstructorMetadata({ target, dependencies })` entries. Dependency indexes are sorted and preserved, so runtime performs no source analysis. Bindings are required even for class tokens, and the most recent explicit binding wins. Singleton caches belong to each `Container`; aliases resolve through the target binding and preserve its identity.

`@Inject(TOKEN)` marks a constructor or managed-method parameter as an explicit container source. Use it for interfaces, aliases, arbitrary values represented by `createToken()`, and deliberately bound plain classes. Compiler analysis rejects primitives, plain objects, non-constructable functions, `any`, `unknown`, and erased type-only declarations as tokens. Automatic type-based injection remains limited to compiler-discovered class kinds whose canonical descriptor declares `injectable: true`.
