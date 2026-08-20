# `@bunwire/core`

Core is platform-independent. It defines generic managed-class metadata and the runtime dependency container; it has no Vite or Electrobun dependency.

## Managed class definitions

Use `defineClassKind()` to describe capabilities and `defineManagedClassDecorator()` to associate an outer decorator with that meaning. IDs must be stable lowercase namespaces such as `queue.consumer`.

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

- `transport` — reads a separately indexed caller argument and records whether that caller position is optional;
- `container` — resolves an explicit runtime token from the invocation container;
- `resolver` — invokes a registered, namespaced custom parameter resolver;
- `context` — supplies the framework `InvocationContext` directly.

Plan array order has no positional meaning. `methodIndex` reconstructs the real method argument list, while `argumentIndex` independently addresses the caller-visible argument list. Caller indexes must be contiguous; argument counts range from one past the highest required caller index through the total caller-visible count. This also handles a defaulted/optional caller position before a later required position.

`InvocationEngine` consumes the prebuilt plan without inspecting source or reclassifying parameters. It validates caller counts, resolves the declared sources, wraps the call in plan middleware, and returns a Promise-normalized result. `Application.invokeManagedMethod()` executes that engine through `runInvocation()`, preserving invocation scope and Provider boot ordering. Unknown resolver IDs and malformed plans fail with dedicated actionable errors.

## Container

`Container` supports class, singleton, transient, value, factory, alias, and existing-instance bindings. Custom runtime identities come from `createToken<T>(description)`; concrete or abstract class constructors can also be tokens.

Constructor resolution is driven by explicit `registerConstructorMetadata({ target, dependencies })` entries. Dependency indexes are sorted and preserved, so runtime performs no source analysis. Bindings are required even for class tokens, and the most recent explicit binding wins. Singleton caches belong to each `Container`; aliases resolve through the target binding and preserve its identity.
