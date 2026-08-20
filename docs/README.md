# TypeScript Application Framework — Architecture Specification v0.4

> Working architecture for Bunwire. This revision incorporates the clarified managed-class model, Provider lifecycle, compiled invocation plans, explicit token injection, adapter-extensible class/method decorators, and `bunwire.config.*` build configuration.

## 1. Overview

Bunwire is a lightweight, opinionated **TypeScript application framework and application kernel**, with Electrobun as its first platform adapter.

The framework is intentionally broader than Electrobun.

The architecture separates:

- **Framework Core** — managed class semantics, controllers, services, Providers, dependency injection, the container, bindings, scopes, tokens, invocation, lifecycle, middleware, metadata, application composition, and extension APIs.
- **Build tooling** — primarily a Vite integration responsible for reading `bunwire.config.*`, source discovery, TypeScript symbol analysis, decorator analysis, generated registries, compiled invocation plans, validation, and generated RPC contracts.
- **Platform adapters** — integrations such as Electrobun that contribute platform-specific managed class kinds, managed method kinds, parameter decorators/resolvers, transports, runtime registry consumers, lifecycle behavior, and compiler extensions.

Electrobun must not be embedded into Core.

The initial target is Electrobun, but Core must expose enough generic machinery that another adapter can add new controller-like class kinds and route-like method kinds without requiring Core or Vite to hard-code them.

The framework should provide:

- managed class decorators;
- class-based controllers;
- services;
- Providers with `register()` and `boot()` phases;
- constructor dependency injection;
- managed-method parameter injection;
- explicit token injection;
- singleton and transient bindings;
- values, factories, aliases, and existing-instance bindings;
- automatic discovery of managed classes;
- adapter-defined managed class and managed method kinds;
- build-time TypeScript analysis through Vite;
- generated application registries;
- generated invocation plans;
- application lifecycle management;
- middleware;
- strong TypeScript typing;
- generated RPC metadata/contracts;
- Electrobun-specific infrastructure resolution through the Electrobun adapter.

The framework should **not replace Electrobun**.

It should turn Electrobun's low-level primitives into a higher-level application architecture while Electrobun remains responsible for the desktop runtime, windows, webviews, and underlying RPC mechanisms.

---

# 2. Core Philosophy

## 2.1 Convention with a bounded source root

Applications define the Bunwire source area through `bunwire.config.*`.

Conceptually:

```ts
export default defineBunwireConfig({
  source: "./src/bun",
});
```

A conventional application may look like:

```text
src/
└── bun/
    ├── controllers/
    ├── services/
    ├── providers/
    ├── middleware/
    ├── bootstrap.ts
    └── main.ts
```

The folder names are conventions, not Core semantics. The compiler discovers managed objects by their registered decorators and adapter extensions within the configured source graph.

## 2.2 Explicitness

Automatic discovery should never remove developer control.

Developers should be able to explicitly configure the container through Providers and the container API:

```ts
container.bind(...)
container.singleton(...)
container.transient(...)
container.value(...)
container.factory(...)
container.alias(...)
```

Explicit tokens are used where a TypeScript type does not provide a concrete runtime identity.

## 2.3 Compile-time intelligence

Bunwire should perform expensive source interpretation once during development/build.

```text
TypeScript Source
      ↓
bunwire.config.*
      ↓
Vite Plugin
      ↓
TypeScript Program / Symbols
      ↓
Managed Class Analysis
      ↓
Managed Method Analysis
      ↓
Parameter Classification
      ↓
Generated Registries + Invocation Plans
      ↓
Bundle
      ↓
Runtime executes generated plans
```

Runtime should not repeatedly inspect source files, rediscover methods, or determine which method parameters are caller arguments versus container injections.

## 2.4 Platform independence

Core understands generic concepts such as:

```text
Managed Class
Managed Method
Controller
Service
Provider
Container
Binding
Dependency
Token
Scope
Invocation
Middleware
Metadata
Adapter
Resolver
Registry
```

Core must not directly understand:

```text
BrowserWindow
Webview
Electrobun RPC
Electrobun messages
HTTP GET
HTTP POST
Bun-specific transport objects
```

Those meanings belong to adapters.

## 2.5 Adapter extensibility

Adapters are first-class compiler and runtime extensions, represented at runtime by **class instances**.

An adapter may contribute:

- outer/class decorators;
- method decorators;
- parameter injectors;
- managed class-kind definitions;
- managed method-kind definitions;
- adapter-owned Providers;
- runtime registry consumers;
- transports;
- host lifecycle integration;
- compiler metadata handlers;
- validation rules;
- generated contract extensions.

The adapter instance is attached to the already-created Bunwire `Application` during application definition. This gives the adapter access to the same registration mechanisms used by Core while the application is still unstarted.

The adapter may also own the normal host bootstrap for its platform. For example, an Electrobun adapter may create/configure the native RPC model and main window; an Express adapter may create/configure the Express application and HTTP server.

Core provides the mechanism; the adapter gives the mechanism platform meaning and may expose native host objects back to the developer through typed configuration callbacks.

---

# 3. The Managed Class Model

An **outer/class decorator** opts a class into Bunwire's managed application graph and describes how the compiler/runtime should treat that class.

The built-in managed classes are initially:

```text
Service
Controller
Provider
```

Adapters may add more.

A managed class kind can conceptually declare capabilities such as:

```ts
defineClassKind({
  id: "core.service",
  injectable: true,
  autoDiscover: true,
  analyzeConstructor: true,
  managedMethods: false,
});
```

Controller-like:

```ts
defineClassKind({
  id: "core.controller",
  injectable: true,
  autoDiscover: true,
  analyzeConstructor: true,
  managedMethods: true,
  registry: true,
});
```

Adapter-defined:

```ts
defineClassKind({
  id: "queue.consumer",
  injectable: true,
  autoDiscover: true,
  analyzeConstructor: true,
  managedMethods: true,
  registry: true,
});
```

The exact API is subject to implementation. The important architectural point is that Vite must not contain a hard-coded list of every possible class decorator.

---

# 4. Automatic Injection Boundary

Automatic type-based DI is allowed only where Bunwire has an explicit managed-class contract.

For example:

```ts
@Service()
export class UserService {}

@Controller("users")
export class UserController {
  constructor(
    private readonly users: UserService,
  ) {}
}
```

Because `UserService` is a managed, injectable class kind, the compiler may infer that constructor parameter automatically.

A random undecorated class is **not** automatically treated as a server-side dependency merely because TypeScript can locate its declaration:

```ts
export class RandomUtility {}
```

If a developer wants it from the container, they make that explicit:

```ts
@Controller("users")
export class UserController {
  constructor(
    @Inject(RandomUtility)
    private readonly utility: RandomUtility,
  ) {}
}
```

and bind it:

```ts
container.singleton(RandomUtility);
```

This prevents DTOs, transport objects, and ordinary application classes from accidentally becoming DI dependencies.

---

# 5. Services

A Service is a managed application class containing reusable application/business logic.

```ts
@Service()
export class UserService {
  constructor(
    private readonly database: DatabaseService,
  ) {}

  async find(id: string) {
    return this.database.users.find(id);
  }
}
```

A Service:

- is automatically discoverable;
- can be automatically injected by concrete class type;
- can have constructor dependencies;
- can have singleton or transient scope;
- does **not** have Provider lifecycle semantics;
- does **not** require its ordinary methods to be compiled into an invocation registry.

Service methods are ordinary TypeScript methods called by application code.

---

# 6. Controllers

A Controller is Core's built-in controller-style managed class kind.

```ts
@Controller("users")
export class UserController {
  constructor(
    private readonly users: UserService,
  ) {}
}
```

A Controller:

- is automatically discovered;
- can have constructor DI;
- can itself be injectable where useful;
- has a generated class registry entry;
- may contain managed/invocable methods contributed by adapters or Core extensions.

Core defines what a Controller **is structurally**. It does not have to define what an Electrobun request or HTTP route means.

---

# 7. Providers

A Provider is **not a Service** and is not a synonym for a container binding.

A Provider is a managed lifecycle/bootstrap class.

```ts
@Provider()
export class AppProvider {
  register(container: Container) {
    container.singleton(EventBus);
    container.bind(Logger, ProductionLogger);
  }

  async boot(context: InvocationContext) {
    // Runs for each managed invocation.
  }
}
```

Provider lifecycle:

```text
register(container)
    ↓
called once during app.start(), after host context is available
    ↓
configures root/runtime container bindings

boot(context)
    ↓
called for each managed invocation
    ↓
prepares invocation-level state before the target method executes
```

`register()` receives the container as its framework-owned parameter. It is not a normal managed method whose parameter list is inferred from application DI.

`boot()` is invocation-level, not application-startup bootstrapping.

Providers are automatically discovered and receive generated Provider registry entries so the application kernel can load and call their known lifecycle hooks.

For v1, Bunwire constructs Provider classes with zero supplied constructor arguments and does not perform Provider constructor injection. Provider constructors must therefore be callable with no arguments. Optional, defaulted, and rest parameters are permitted because they remain callable with zero supplied arguments; required constructor parameters are rejected at the typed Provider-registry boundary. Startup dependencies and bindings are accessed through the framework-owned `register(container)` hook; `register()` parameters are not analyzed as ordinary method DI.

Container entries should be called **bindings**, not Providers.

---

# 8. Bindings, Tokens, and Explicit Injection

A binding is something the container knows how to resolve.

Bindings include:

- class bindings;
- singleton class bindings;
- transient class bindings;
- value bindings;
- factory bindings;
- aliases;
- existing instances.

Not every injectable thing is a concrete class.

For interfaces, objects, factories, runtime handles, and other erased TypeScript types, use a runtime token:

```ts
export interface Cache {
  get(key: string): Promise<unknown>;
}

export const CACHE = createToken<Cache>("cache");
```

Bind it:

```ts
@Provider()
export class CacheProvider {
  register(container: Container) {
    container.singleton(CACHE, () => createCache());
  }
}
```

Inject it explicitly:

```ts
@Service()
export class UserService {
  constructor(
    @Inject(CACHE)
    private readonly cache: Cache,
  ) {}
}
```

An interface by itself is not a runtime token and must not be treated as one.

---

# 9. Container

Core owns the dependency container.

Conceptually:

```ts
container.bind(Logger, ProductionLogger);
container.singleton(DatabaseService);
container.transient(FormatterService);
container.value(APP_CONFIG, config);
container.factory(Database, createDatabase);
container.alias(Cache, REDIS_CACHE);
container.get(UserService);
```

The exact overloads are subject to implementation.

The container owns runtime resolution and lifetimes. Vite owns compile-time knowledge of **how an injection position should be resolved**, not the runtime value itself.

---

# 10. Constructor Dependency Metadata

Managed class constructors are analyzed by Vite.

```ts
@Service()
export class UserService {
  constructor(
    private readonly logger: LoggerService,
    @Inject(CACHE)
    private readonly cache: Cache,
  ) {}
}
```

Generated metadata preserves real constructor positions:

```ts
{
  target: UserService,
  dependencies: [
    {
      index: 0,
      source: "container",
      token: LoggerService,
    },
    {
      index: 1,
      source: "container",
      token: CACHE,
    },
  ],
}
```

Indexes are semantically important even if the generated code later optimizes the representation.

---

# 11. Managed Method Kinds

An outer managed class may permit **managed method decorators**.

For Electrobun, a Controller can contain:

```ts
@Route("get")
getUser(...) {}

@Message("selected")
selected(...) {}
```

An adapter may introduce a completely different class/method pair:

```ts
@Consumer()
export class OrderConsumer {
  @Subscribe("orders.created")
  handle(...) {}
}
```

The adapter can conceptually declare:

```ts
defineMethodKind({
  id: "queue.subscribe",
  allowedOn: ["queue.consumer"],
  invocable: true,
});
```

The compiler then generates the owning class, method, extension metadata, and complete parameter plan without Vite understanding queue semantics.

---

# 12. Method Parameters: Two Coordinate Systems

Every managed/invocable method has two distinct parameter coordinate systems:

1. **method indexes** — the real positions in the server-side method;
2. **caller argument indexes** — the positions visible to the transport/frontend caller.

Example:

```ts
@Route("get")
get(
  id: string,                  // method index 0 / caller arg 0
  users: UserService,          // method index 1 / container
  name: string,                // method index 2 / caller arg 1
  @Inject(CACHE) cache: Cache, // method index 3 / container
  active?: boolean,            // method index 4 / caller arg 2
) {}
```

Generated plan:

```ts
{
  method: "get",
  parameters: [
    {
      index: 0,
      source: "transport",
      argumentIndex: 0,
      optional: false,
    },
    {
      index: 1,
      source: "container",
      token: UserService,
    },
    {
      index: 2,
      source: "transport",
      argumentIndex: 1,
      optional: false,
    },
    {
      index: 3,
      source: "container",
      token: CACHE,
    },
    {
      index: 4,
      source: "transport",
      argumentIndex: 2,
      optional: true,
    },
  ],
}
```

The frontend sends only:

```ts
rpc.request("users/get", id, name, active);
```

It never supplies `UserService` or `CACHE`.

---

# 13. Default Method Parameter Classification

For a managed method, the compiler enumerates **every parameter automatically**.

The default classification order should be:

```text
registered parameter injector decorator?
    → injector(resolverId)

explicit @Inject(TOKEN)?
    → container(TOKEN)

concrete type belongs to a managed class kind with injectable=true?
    → container(Class)

otherwise
    → caller/transport argument
```

This means an Electrobun controller can be written naturally:

```ts
@Route("get")
get(
  id: string,
  users: UserService,
  includePosts?: boolean,
) {}
```

and compile to:

```text
method 0 ← caller arg 0
method 1 ← container(UserService)
method 2 ← caller arg 1
```

No `@Arg(0)` decorator is required.

Parameter injectors are framework-supplied parameters. They are never caller-visible, regardless of whether their value comes from the container, the invocation context, or an adapter-specific runtime resolver.

---

# 14. `@Inject()`

`@Inject()` is explicit runtime token selection.

Constructor example:

```ts
constructor(
  @Inject(CACHE)
  cache: Cache,
) {}
```

Managed method example:

```ts
@Route("save")
save(
  payload: SaveDto,
  @Inject(CACHE) cache: Cache,
) {}
```

In a managed method, `@Inject()` also tells the compiler that the parameter is **not caller-visible**.

`@Inject()` is necessary when:

- the TypeScript type is an interface;
- the runtime identity is a token/alias rather than a concrete managed class;
- the developer wants to override type inference;
- the parameter is an explicitly bound plain class.

---

# 15. Parameter Injectors

Injected managed-method parameters are a first-class extension category.

Core provides container injection through `@Inject()` and managed-class type inference. Adapters may define additional parameter-injection decorators whose values come from adapter/runtime context.

Electrobun examples:

```ts
@Window()
window: BrowserWindow
```

```ts
@Webview()
webview: Webview
```

```ts
@Context()
context: RpcContext
```

Conceptually:

```text
@Inject(CACHE)  → Core/container injector
@Window()       → Electrobun injector
@Webview()      → Electrobun injector
@Context()      → Electrobun injector
```

Each adapter parameter injector has a registered runtime resolver ID. The decorator selects the injection source; it does not manually specify the method parameter index because TypeScript analysis already provides that index.

A transport-specific `@Body()` may exist only if the adapter has a meaningful payload/body abstraction. It is not required for ordinary positional Electrobun arguments.

All injected parameters are excluded automatically from generated caller-facing contracts.

---

# 16. No `@Arg(index)` Requirement

Bunwire should not require developers to repeat parameter positions manually.

This:

```ts
@Route("get")
get(id: string, page: number) {}
```

already gives the compiler enough information to generate:

```text
method index 0 ← caller argument 0
method index 1 ← caller argument 1
```

When injected parameters are interleaved:

```ts
get(
  id: string,
  users: UserService,
  page: number,
  logger: LoggerService,
) {}
```

Bunwire generates:

```text
method 0 ← caller arg 0
method 1 ← container(UserService)
method 2 ← caller arg 1
method 3 ← container(LoggerService)
```

The compiler owns this mapping.

---

# 17. Caller Argument Validation

The generated invocation plan knows which parameters are caller-visible and which are optional.

For:

```ts
get(
  id: string,
  users: UserService,
  name: string,
  active?: boolean,
) {}
```

the caller-visible signature is:

```ts
(id: string, name: string, active?: boolean)
```

At runtime, Bunwire should reject too few or too many transport arguments according to the generated plan.

Generated TypeScript contracts should catch most mistakes at development time; runtime validation protects the RPC boundary.

---

# 18. Compiled Invocation Plans

The Vite compiler performs method classification once and emits an execution plan.

Runtime should not ask:

```text
Which parameters are injected?
Which parameters came from the frontend?
What is their position?
Which token should be resolved?
```

Those questions were already answered by generated metadata/code.

A first implementation may interpret metadata:

```ts
args[0] = incoming[0];
args[1] = container.get(UserService);
args[2] = incoming[1];
```

A later optimizer may generate direct invoker functions:

```ts
function invokeUsersGet(controller, container, incoming) {
  return controller.get(
    incoming[0],
    container.get(UserService),
    incoming[1],
  );
}
```

Both honor the same semantic model.

---

# 19. Provider Registration vs Build-Time Compilation

Provider bindings are runtime configuration.

Vite does **not** need to execute Provider `register()` or prove that every explicit token is bound in order to generate injection plans.

For:

```ts
@Route("save")
save(
  @Inject(CACHE) cache: Cache,
) {}
```

Vite only needs to compile:

```text
method parameter → container(CACHE)
```

At runtime a Provider may establish the binding:

```ts
register(container: Container) {
  container.singleton(CACHE, () => createCache());
}
```

If `CACHE` is not actually available at runtime, the container reports a resolution error.

Future static analysis may inspect declarative bindings for better diagnostics, but Provider AST interpretation is not required for the first architecture.

---

# 20. Application Runtime Lifecycle

`defineApp()` creates an **Application instance immediately**. The object can be configured and exported before anything is started.

The normal runtime lifecycle is conceptually:

```text
bootstrap.ts executes
        ↓
defineApp() creates Application
        ↓
withAdapter(adapterInstance)
        ↓
adapter attaches to Application and contributes
Providers / injectors / runtime integration
        ↓
Application is exported but NOT started
        ↓
host entrypoint imports Application
        ↓
app.start()
        ↓
create root container
        ↓
load generated registry
        ↓
primary adapter prepares native host context
without accepting managed traffic yet
        ↓
store application/adapter context in container
        ↓
discover/create Provider instances
        ↓
Provider.register(rootContainer) — once
        ↓
apply auto-generated managed-class bindings
        ↓
connect generated managed methods to adapter runtime
        ↓
primary adapter completes host start
        ↓
Application running
        ↓
Incoming invocation
        ↓
Create invocation context/scope where required
        ↓
Provider.boot(context) — per invocation
        ↓
Resolve target managed class
        ↓
Execute compiled parameter/injector plan
        ↓
Middleware
        ↓
Managed method
        ↓
Transport result / completion
```

The exact internal adapter lifecycle method names are implementation details. The public lifecycle boundary is `app.start()`.

Core's v1 startup contract fails clearly if `start()` is called a second time or while a first startup is still running. Configuration methods likewise reject changes after startup begins. Provider registries are deduplicated by class identity, and all asynchronous `register()` calls finish before the Application enters its running state or accepts managed invocations.

Until adapter transports and compiled managed-method plans are connected, Core exposes `runInvocation()` as the generic managed-invocation boundary. It creates an isolated child container and real `InvocationContext`, applies invocation-local bindings, runs Provider `boot(context)`, and only then calls the invocation handler. This is lifecycle/scope orchestration rather than automatic exposure of Service or Controller methods.

For the manual-host escape hatch, `app.withContext(context)` supplies an already-created host context before `start()`. This path is useful for existing applications, unusual host ownership, and tests; it is not the recommended default when a full adapter can own the platform bootstrap.

Exact ordering between explicit Provider bindings and convention-generated bindings must preserve deterministic developer override behavior.

---

# 21. Registration Precedence

A useful intended precedence is:

```text
Framework defaults
      ↓
Convention/generated managed-class defaults
      ↓
Adapter defaults
      ↓
Provider.register() explicit bindings
      ↓
Explicit application/runtime overrides, where supported
```

Implementation may stage these differently as long as explicit developer bindings deterministically win over convention defaults. Core stages convention/default registrations before `Provider.register()` so the container's last-binding-wins behavior gives Provider-created bindings explicit precedence.

---

# 22. `bootstrap.ts`

`bootstrap.ts` is the application composition root. It **defines and exports** an instantiated Bunwire Application but does not start it.

The recommended form is a chainable API:

```ts
import { defineApp } from "@bunwire/core";
import { ElectrobunAdapter } from "@bunwire/electrobun";

export default defineApp()
  .withAdapter(
    new ElectrobunAdapter({
      mainWindow: {
        title: "My App",
        width: 1200,
        height: 800,

        configure(window) {
          // Real Electrobun BrowserWindow escape hatch.
        },
      },
      rpc: {
        configure(rpc) {
          // Real Electrobun RPC escape hatch.
        },
      },
    }),
  );
```

The application is already instantiated here; it is simply not running yet.

The host entrypoint imports that same object and starts it:

```ts
import app from "./bootstrap";

await app.start();
```

For a manual integration, the developer may provide context explicitly:

```ts
await app
  .withContext(existingElectrobunContext)
  .start();
```

Providers are preferably auto-discovered from the configured Bunwire source tree. Explicit Provider inclusion may still be supported for classes outside ordinary discovery. Adapter instances may also contribute their own Providers.

Container bindings belong primarily in Provider `register()` and/or explicit container configuration APIs rather than being mislabeled as “providers.”

---

# 23. `bunwire.config.*`

Build configuration defines the bounded source graph and build-time behavior. Runtime adapter configuration belongs in `bootstrap.ts`, not duplicated in the build config.

Conceptually:

```ts
export default defineBunwireConfig({
  source: "./src/bun",
  bootstrap: "./src/bun/bootstrap.ts",
});
```

Possible responsibilities include:

- source root(s);
- bootstrap/composition-root location;
- generated output options;
- diagnostics configuration;
- optional discovery conventions.

The compiler analyzes the configured bootstrap source and resolves adapter classes used by `withAdapter(...)`. Adapter packages expose the compiler descriptors associated with those adapter classes, so the runtime adapter does not need to be declared a second time in `bunwire.config.*`.

The compiler must not execute arbitrary adapter instance configuration merely to discover extensions. It resolves the adapter class/symbol and loads the adapter's declared compiler integration deterministically.

`bunwire.config.*` is build configuration. `bootstrap.ts` is runtime/application composition.

---

# 24. Vite Scanner and TypeScript Analysis

The Vite package should create/use a TypeScript Program so it can resolve real symbols rather than relying only on decorator text.

It needs to understand:

- source files in the configured graph;
- imports and aliases;
- class declarations;
- registered outer/class decorators;
- registered managed method decorators;
- constructor parameter types;
- explicit `@Inject()` tokens;
- managed method parameter types;
- registered parameter injector decorators;
- optional/rest parameter information;
- return types for generated contracts;
- source locations for diagnostics.

The analyzer should resolve symbols to their actual declarations where necessary.

---

# 25. Generated Registries

The build should generate registry modules rather than requiring manual registration tables.

Conceptually:

```ts
export const applicationRegistry = {
  classes: [
    {
      kind: "core.service",
      target: UserService,
      scope: "singleton",
      dependencies: [
        { index: 0, token: DatabaseService },
      ],
    },
    {
      kind: "core.controller",
      target: UserController,
      dependencies: [
        { index: 0, token: UserService },
      ],
      methods: [/* generated managed method metadata */],
    },
  ],
  providers: [AppProvider],
};
```

The exact shape may be split into Core and adapter registries for tree-shaking and ownership clarity.

---

# 26. Generic Adapter Class/Method Registries

Core must allow an adapter to receive a generated registry for its own managed class/method kinds.

Example source:

```ts
@Consumer("orders")
export class OrderConsumer {
  @Subscribe("created")
  async created(
    event: OrderCreated,
    audit: AuditService,
  ) {}
}
```

Possible generated representation:

```ts
{
  kind: "queue.consumer",
  target: OrderConsumer,
  metadata: { name: "orders" },
  methods: [
    {
      kind: "queue.subscribe",
      method: "created",
      metadata: { event: "created" },
      parameters: [
        {
          index: 0,
          source: "transport",
          argumentIndex: 0,
        },
        {
          index: 1,
          source: "container",
          token: AuditService,
        },
      ],
    },
  ],
}
```

The queue adapter decides how to register and invoke this at runtime.

---

# 27. Adapter Definition

A runtime adapter is a **class instance** attached to an Application.

Conceptually:

```ts
abstract class Adapter<TContext = unknown> {
  protected app!: Application;

  attach(app: Application): void {
    this.app = app;
  }

  // Internal lifecycle shape is illustrative only.
  abstract prepare(): Promise<TContext> | TContext;
  abstract start(context: TContext): Promise<void> | void;
}
```

`Application.withAdapter()` attaches the instance before the application starts:

```ts
class Application {
  withAdapter<TAdapter extends Adapter>(adapter: TAdapter): this {
    adapter.attach(this);
    this.adapter = adapter;
    return this;
  }
}
```

The adapter class may contribute:

```text
managed class kinds
managed method kinds
parameter injectors and their runtime resolvers
adapter-owned Providers
compiler descriptors
runtime registry consumers
host preparation/start behavior
native configuration callbacks
validation hooks
```

Adapter classes should expose their compiler-facing definitions in a way Vite can resolve from the class symbol without executing arbitrary runtime configuration.

For v1, Bunwire assumes one primary host adapter controls application startup. Supporting multiple unrelated host adapters simultaneously is not required for the first release.

A full adapter owns the normal host bootstrap. A manual adapter variant may instead consume context supplied through `app.withContext(...)`.

---

# 28. Electrobun Adapter

Electrobun is the first adapter and should be shipped as a class-based host integration.

The recommended/full export owns the normal Electrobun scaffold:

```ts
new ElectrobunAdapter({
  mainWindow: {
    title: "My App",
    width: 1200,
    height: 800,
    configure(window) {
      // Actual Electrobun BrowserWindow.
    },
  },
  rpc: {
    configure(rpc) {
      // Actual Electrobun RPC object.
    },
  },
});
```

The adapter owns Electrobun-specific concepts such as:

```text
@Route()
@Message()
@Window()
@Webview()
@Context()
RPC request registration
RPC message registration
BrowserWindow/Webview parameter injection
adapter-owned Providers
Electrobun host/context creation
Bun → Webview outgoing communication through Electrobun's native APIs
```

The adapter may reproduce the useful defaults of an ordinary Electrobun scaffold as declarative configuration while preserving access to real native objects through typed callbacks.

A manual Electrobun adapter/integration path should also be available for existing or unusually structured Electrobun applications. In that mode the developer creates the native runtime/context and supplies it through `app.withContext(...)` before `app.start()`.

Core should not import Electrobun concepts.

---

# 29. Electrobun Requests

Example:

```ts
@Controller("users")
export class UserController {
  @Route("get")
  async getUser(
    id: string,
    users: UserService,
  ) {
    return users.find(id);
  }
}
```

Caller:

```ts
rpc.request("users/get", id);
```

The generated invocation plan injects `UserService`; the frontend never supplies it.

---

# 30. Electrobun Messages

Example:

```ts
@Controller("analytics")
export class AnalyticsController {
  @Message("click")
  trackClick(
    buttonId: string,
    logger: LoggerService,
  ) {
    logger.info(buttonId);
  }
}
```

Caller:

```ts
rpc.message("analytics/click", buttonId);
```

Messages have no response contract.

---

# 31. Requests vs Messages

| Feature | Request | Message |
|---|---|---|
| Electrobun decorator | `@Route()` | `@Message()` |
| Response contract | Yes | No |
| Return value | Meaningful | Not caller-visible |
| Caller awaits result | Yes | No |
| Typical use | queries/commands with result | telemetry/events/notifications |

The distinction is transport semantics, not browser-thread blocking.

---

# 32. Controller Prefixes

For:

```ts
@Controller("users")
export class UserController {
  @Route("get")
  getUser() {}

  @Message("deleted")
  deleted() {}
}
```

Electrobun receives logical paths:

```text
Request: users/get
Message: users/deleted
```

Trailing slashes and path segments should be normalized deterministically.

---

# 33. Platform-Owned Objects

Platform objects remain **native platform objects** even when a full Bunwire adapter creates/configures them on the developer's behalf.

For example, the Electrobun adapter may create the main `BrowserWindow` as part of its normal host bootstrap, but Core must never construct or emulate a `BrowserWindow`. Ownership semantics and native behavior remain Electrobun's.

The adapter can expose those objects through parameter injectors:

```ts
@Route("title")
getTitle(
  @Window() window: BrowserWindow,
) {
  return window.title;
}
```

and through typed configuration callbacks:

```ts
new ElectrobunAdapter({
  mainWindow: {
    configure(window) {
      // Real BrowserWindow instance.
    },
  },
});
```

Bunwire should not replace Electrobun's outgoing communication APIs. The adapter may expose or lightly integrate them, but developers retain access to the actual platform runtime.

---

# 34. Middleware

Middleware remains a Core capability around managed invocation.

Potential levels include:

```text
Application middleware
Managed-class middleware
Managed-method middleware
Adapter-specific middleware layers
```

Example:

```ts
@Use(loggingMiddleware)
@Route("get")
getUser(id: string) {}
```

Middleware may handle logging, validation, authorization, telemetry, timing, auditing, and errors.

Adapters decide how their runtime events enter the generic invocation/middleware pipeline.

---

# 35. Invocation Runtime

Conceptually:

```text
Adapter/runtime event
      ↓
Generated managed-method metadata
      ↓
Resolve target class
      ↓
Provider.boot(context)
      ↓
Validate caller argument count
      ↓
Execute generated parameter plan
      ↓
args[] in true method-index order
      ↓
Middleware
      ↓
method(...args)
      ↓
Adapter result/completion
```

The runtime does not infer parameter sources on each invocation.

---

# 36. Generated RPC Contracts

Injected/server-side parameters must be excluded from caller-facing contracts.

Server:

```ts
@Route("get")
async getUser(
  id: string,
  users: UserService,
  @Inject(CACHE) cache: Cache,
  includePosts?: boolean,
): Promise<User> {}
```

Generated caller contract:

```ts
"users/get": (
  id: string,
  includePosts?: boolean,
) => Promise<User>
```

The compiler derives the caller-visible argument list from the same parameter plan used by runtime invocation.

---

# 37. Frontend API

The initial API may remain close to Electrobun:

```ts
rpc.request("users/get", id);
rpc.message("users/deleted", id);
```

A future generated API may provide:

```ts
rpc.users.get(id);
rpc.users.deleted(id);
```

This is optional and should not distort the underlying transport semantics.

---

# 38. Build-Time Validation

The compiler should validate facts it can prove from source metadata, including:

- invalid managed-class decorator usage;
- invalid managed-method decorator placement;
- duplicate logical endpoint identifiers where the owning adapter requires uniqueness;
- invalid parameter metadata;
- impossible automatic injection targets;
- explicit `@Inject()` syntax/token extraction failures;
- circular constructor dependencies among statically known managed classes where detectable;
- adapter/compiler metadata errors.

The compiler does **not** need to prove that every runtime token registered by Provider code will exist. Runtime container resolution remains authoritative for dynamic bindings.

---

# 39. Security Boundary

A public method is not automatically externally invocable merely because it is public.

```ts
@Controller("users")
class UserController {
  @Route("get")
  getUser() {}

  formatUser() {}
}
```

Only the method carrying a recognized managed-method decorator is exposed through the corresponding adapter registry.

---

# 40. Recommended Application Structure

```text
src/
│
├── bun/
│   ├── controllers/
│   ├── services/
│   ├── providers/
│   ├── middleware/
│   ├── bootstrap.ts
│   └── main.ts
│
├── web/
│   └── ...
│
└── shared/
    ├── types.ts
    └── rpc.ts

bunwire.config.ts
```

`bootstrap.ts` defines/exports the Application. `main.ts` imports it and calls `app.start()` at the host entrypoint. A full adapter normally creates its own platform context; a manual integration may call `withContext()` before `start()`.

The source structure is conventional. The configured source root and registered decorators are authoritative.

---

# 41. Complete Electrobun Example

Application code:

```ts
export interface Cache {
  get(key: string): Promise<unknown>;
}

export const CACHE = createToken<Cache>("cache");

@Provider()
export class AppProvider {
  register(container: Container) {
    container.singleton(DatabaseService);
    container.singleton(CACHE, () => createCache());
  }

  async boot(context: InvocationContext) {
    // Per invocation setup when needed.
  }
}

@Service({ scope: "singleton" })
export class UserService {
  constructor(
    private readonly database: DatabaseService,
  ) {}

  async find(id: string) {
    return this.database.users.find(id);
  }
}

@Controller("users")
export class UserController {
  constructor(
    private readonly users: UserService,
  ) {}

  @Route("get")
  async get(
    id: string,
    @Inject(CACHE) cache: Cache,
    @Window() window: BrowserWindow,
    includePosts?: boolean,
  ) {
    return this.users.find(id);
  }

  @Message("selected")
  selected(
    id: string,
    logger: LoggerService,
  ) {
    logger.info(`Selected: ${id}`);
  }
}
```

Bootstrap:

```ts
// src/bun/bootstrap.ts
import { defineApp } from "@bunwire/core";
import { ElectrobunAdapter } from "@bunwire/electrobun";

export default defineApp()
  .withAdapter(
    new ElectrobunAdapter({
      mainWindow: {
        title: "Users",
        width: 1200,
        height: 800,
        configure(window) {
          // Optional native customization.
        },
      },
    }),
  );
```

Host entrypoint:

```ts
// src/bun/main.ts
import app from "./bootstrap";

await app.start();
```

Generated request-facing signature:

```ts
"users/get": (
  id: string,
  includePosts?: boolean,
) => Promise<User>
```

`CACHE` and `BrowserWindow` are injected parameters and are not caller arguments.

A manual-host application may instead attach the manual Electrobun integration and provide an existing context with `app.withContext(context).start()`.

---

# 42. Monorepo Architecture

```text
framework/
│
├── packages/
│   ├── core/
│   │   └── src/
│   │       ├── decorators/
│   │       ├── managed-classes/
│   │       ├── managed-methods/
│   │       ├── container/
│   │       ├── bindings/
│   │       ├── providers/
│   │       ├── metadata/
│   │       ├── lifecycle/
│   │       ├── middleware/
│   │       ├── invocation/
│   │       └── adapters/
│   │
│   ├── vite/
│   │   └── src/
│   │       ├── config/
│   │       ├── scanner/
│   │       ├── analyzer/
│   │       ├── symbols/
│   │       ├── parameter-plans/
│   │       ├── validation/
│   │       ├── generator/
│   │       └── plugin.ts
│   │
│   └── electrobun/
│       └── src/
│           ├── decorators/
│           ├── resolvers/
│           ├── rpc/
│           ├── runtime/
│           └── compiler/
│
├── examples/
│   └── electrobun-app/
│
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.json
```

Dependency direction:

```text
                    core
                     ▲
                     │
          ┌──────────┴──────────┐
          │                     │
         vite              electrobun
          │                     │
          └──────────┬──────────┘
                     │
                 application
```

`core` knows nothing about Vite or Electrobun.

---

# 43. Architectural Invariants

The following are release-defining rules.

1. **Core never imports a platform adapter.**
2. **Core never imports Vite.**
3. **Outer/class decorators opt classes into Bunwire's managed graph.**
4. **Automatic type-based DI only targets class kinds explicitly marked injectable.**
5. **Plain classes require explicit container intent, such as `@Inject(Class)` plus a binding, unless a future class kind opts them in.**
6. **Interfaces and arbitrary objects use explicit runtime tokens.**
7. **Services are not Providers.**
8. **Container entries are bindings, not Providers.**
9. **`defineApp()` creates the Application; `app.start()` is the normal public startup boundary.**
10. **A full adapter is a class instance attached before startup and may own normal host bootstrap.**
11. **Host/adapter context is stored in the root container before Provider registration that depends on it.**
12. **Provider `register()` runs once during application startup.**
13. **Provider `boot()` is invocation-level.**
14. **Provider lifecycle parameters are framework-defined rather than ordinary caller arguments.**
15. **Every managed constructor dependency has a real parameter index.**
16. **Every managed method parameter has a real method index.**
17. **Caller argument indexes are generated independently from method indexes.**
18. **Injected parameters never appear in generated caller-facing RPC signatures.**
19. **Developers do not manually repeat ordinary caller argument indexes with `@Arg(index)`.**
20. **Parameter injector decorators select resolution sources; the compiler already knows their indexes.**
21. **Vite compiles parameter classification once; runtime executes the generated plan.**
22. **Provider binding code does not need to be executed by Vite for the core architecture to work.**
23. **Controllers expose only recognized managed methods.**
24. **Adapters may introduce new controller-like class kinds, route-like method kinds, parameter injectors, and adapter-owned Providers.**
25. **Vite must consume generic class/method/injector definitions instead of hard-coding adapter decorators.**
26. **Platform-native objects remain platform-native even when a full adapter creates/configures them.**
27. **Requests and messages remain distinct transport semantics.**
28. **Generated registries and contracts are implementation outputs, not manually maintained structures.**
29. **Runtime does not rediscover the application source tree.**
30. **`bunwire.config.*` defines the bounded build-time source graph and locates the composition root.**
31. **Runtime adapter configuration belongs in `bootstrap.ts`, not duplicated in build configuration.**
32. **The framework does not replace the underlying platform runtime.**
33. **`withContext()` is an explicit/manual host integration path; full adapters should normally create and register their own context.**

---

# 44. Long-Term Direction

The same Core machinery should support integrations such as:

```text
                    Framework Core
                          │
               Managed Class/Method API
                          │
          ┌───────────────┼───────────────┐
          │               │               │
     Electrobun        HTTP/Node        Queue/Jobs
      Adapter           Adapter           Adapter
          │               │               │
      @Route           @Get/@Post      @Consumer/@Job
      @Message                         @Subscribe/@Run
```

The point is not to run unrelated adapters simultaneously by default. The point is that adding one should not require redesigning Core's compiler/runtime model.

---

# 45. Final Summary

Bunwire is a TypeScript application kernel whose compiler understands **managed classes**, **managed methods**, and **parameter plans**.

Core provides:

```text
Managed class semantics
Service / Controller / Provider kinds
Container and bindings
Tokens and @Inject
Scopes
Provider lifecycle
Invocation
Middleware
Metadata
Adapter extension APIs
```

Vite/build tooling provides:

```text
bunwire.config loading
Source discovery
TypeScript symbol analysis
Managed class discovery
Managed method discovery
Constructor dependency analysis
Method parameter classification
Caller-argument mapping
Validation
Generated registries
Generated invocation plans
Generated contracts
```

Adapters provide:

```text
Platform-specific managed class kinds when needed
Platform-specific managed method kinds
Parameter injectors and runtime resolvers
Adapter-owned Providers
Runtime registry consumers
Host bootstrap and transports
Platform lifecycle integration
Compiler metadata extensions
```

For Electrobun, a developer should be able to write controllers, services, Providers, and typed methods while Bunwire compiles the object graph and invocation plans once. At runtime the exported Application is started once. Its adapter prepares the native host context, Bunwire stores that context in the root container, runs Provider registration once, connects generated registries to the adapter, and completes host startup. Each invocation then runs Provider boot, resolves injected parameters from the container or adapter injectors, places caller arguments into their correct method positions, and hands the result back to the platform.

That separation is the foundation of Bunwire.
