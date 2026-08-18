# TypeScript Application Framework — Architecture Specification v0.2

## 1. Overview

We are designing a lightweight, opinionated **TypeScript application framework and application kernel**, with Electrobun as its first platform adapter.

The framework is intentionally broader than Electrobun.

The architecture separates:

- **Framework Core** — controllers, services, dependency injection, containers, providers, scopes, lifecycle, middleware, metadata, application composition, and extension APIs.
- **Build tooling** — primarily a Vite integration responsible for source discovery, source analysis, validation, dependency-graph generation, and generated registries.
- **Platform adapters** — integrations such as Electrobun that contribute platform-specific decorators, providers, parameter resolvers, transports, lifecycle behavior, compiler extensions, and metadata handlers.

Electrobun should therefore not be embedded into Core.

The initial target is Electrobun, but Core should be designed so that another adapter can integrate naturally without requiring Core changes for every platform-specific feature.

The framework should provide:

- Class-based controllers
- Decorator-based application metadata
- Request/response RPC endpoints through adapters
- Fire-and-forget message endpoints through adapters
- Parameter decorators
- Constructor dependency injection
- Method parameter injection
- Services
- Singleton and transient services
- Explicit dependency/container registration
- Automatic controller/service/provider discovery
- A `bootstrap.ts` composition root
- Application lifecycle management
- Middleware
- Build-time registration through Vite
- Strong TypeScript typing
- Generated application metadata
- Generated RPC metadata/contracts
- A generic adapter/extension system
- Electrobun-specific infrastructure providers through the Electrobun adapter

The framework should **not replace Electrobun**.

It should turn Electrobun's low-level primitives into a higher-level application architecture while keeping Electrobun responsible for the underlying desktop runtime and communication mechanisms.

---

# 2. Core Philosophy

## 2.1 Convention

Developers should be able to follow a predictable project structure:

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

The build tooling automatically discovers relevant classes.

Convention should reduce boilerplate without preventing explicit configuration.

---

## 2.2 Explicitness

Automatic discovery should never remove developer control.

Developers should be able to explicitly register:

- classes
- providers
- values
- factories
- aliases
- tokens
- middleware
- singleton instances
- application hooks
- adapters

through `bootstrap.ts` and/or the container API.

Explicit registrations should be capable of overriding or augmenting convention-based registrations according to a documented precedence model.

---

## 2.3 Compile-Time Intelligence

The framework should perform as much discovery and validation as practical during development/build rather than relying on runtime filesystem scanning or excessive reflection.

The intended pipeline is:

```text
Source
  ↓
Vite
  ↓
Scanner / Analyzer
  ↓
Framework + Adapter metadata
  ↓
Dependency and endpoint validation
  ↓
Generated Registry
  ↓
Application Runtime
```

Runtime should consume generated metadata rather than rediscovering the application structure.

---

## 2.4 Platform Independence

Core must not import or depend on Electrobun.

Core understands concepts such as:

```text
Controller
Service
Provider
Container
Dependency
Scope
Lifecycle
Middleware
Metadata
Adapter
Resolver
Transport
```

Core must not directly understand:

```text
BrowserWindow
Webview
Electrobun RPC
Electrobun messages
Bun
```

Those belong to the Electrobun adapter.

---

## 2.5 Adapter Extensibility

Adapters are first-class framework extensions.

An adapter may contribute:

- decorators
- parameter decorators
- providers
- parameter resolvers
- transports
- lifecycle hooks
- compiler/build-time extensions
- metadata handlers
- application configuration
- platform services

This allows a platform to integrate without modifying Core.

---

# 3. High-Level Architecture

```text
                         Application Source
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
        Controllers          Services          Providers
             │                  │                  │
             └──────────────────┼──────────────────┘
                                │
                           Vite Plugin
                                │
                    Build-Time Discovery
                                │
                    Framework Compiler
                                │
                    Loaded Adapter Extensions
                                │
                    Generated Application
                           Registry
                                │
                         Application
                          Bootstrap
                                │
                         Dependency
                           Container
                                │
                    ┌───────────┴───────────┐
                    │                       │
               Core Runtime          Platform Adapter
                                            │
                                      Electrobun
                                            │
                              ┌─────────────┼─────────────┐
                              │             │             │
                             RPC         Window        Webview
                              │
                     ┌────────┴────────┐
                     │                 │
                  Requests          Messages
                     │                 │
                 @Route()          @Message()
```

---

# 4. Monorepo Architecture

The project should be organized as a monorepo from the beginning.

```text
framework/
│
├── packages/
│   │
│   ├── core/
│   │   ├── src/
│   │   │   ├── decorators/
│   │   │   ├── container/
│   │   │   ├── providers/
│   │   │   ├── metadata/
│   │   │   ├── lifecycle/
│   │   │   ├── middleware/
│   │   │   ├── invocation/
│   │   │   └── adapters/
│   │   └── package.json
│   │
│   ├── vite/
│   │   ├── src/
│   │   │   ├── scanner/
│   │   │   ├── analyzer/
│   │   │   ├── dependency-graph/
│   │   │   ├── generator/
│   │   │   └── plugin.ts
│   │   └── package.json
│   │
│   └── electrobun/
│       ├── src/
│       │   ├── decorators/
│       │   ├── providers/
│       │   ├── resolvers/
│       │   ├── rpc/
│       │   └── compiler/
│       └── package.json
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

- `core` knows nothing about Vite or Electrobun.
- `vite` consumes Core compiler concepts.
- `electrobun` consumes Core concepts and implements the Electrobun adapter.
- An application consumes Core plus its selected adapter and build integration.

---

# 5. Framework Core

Core contains the generic application kernel.

Core responsibilities include:

```text
Decorators
Container
Dependency resolution
Providers
Scopes
Tokens
Lifecycle
Middleware
Invocation
Metadata model
Application composition
Adapter registration
Extension APIs
```

Core remains intentionally small.

It should not contain platform-specific routing, RPC, browser-window, or desktop APIs.

---

# 6. Controllers

Controllers are application classes that can expose operations through an adapter.

```ts
@Controller("users")
export class UserController {
  constructor(
    private readonly users: UserService
  ) {}
}
```

The generic controller concept belongs to Core.

The meaning of endpoint decorators is determined by the active adapter.

For Electrobun, `@Route()` can represent an RPC request endpoint.

---

# 7. Controller Prefixes

`@Controller()` defines a logical base path/namespace.

```ts
@Controller("users")
export class UserController {}
```

For Electrobun:

```ts
@Route("get")
getUser() {}

@Route("create")
createUser() {}
```

produces:

```text
users/get
users/create
```

Trailing slashes should be normalized.

---

# 8. Services

Services are Core application classes containing reusable business logic.

```ts
@Service()
export class UserService {

  async get(id: string) {
    // business logic
  }
}
```

Controllers consume services:

```ts
@Controller("users")
export class UserController {

  constructor(
    private readonly users: UserService
  ) {}

  @Route("get")
  getUser(id: string) {
    return this.users.get(id);
  }
}
```

Controllers should generally remain thin while services own reusable application logic.

---

# 9. Dependency Injection

Core provides the dependency injection container.

```ts
@Service()
export class DatabaseService {}

@Service()
export class UserService {

  constructor(
    private readonly database: DatabaseService
  ) {}
}

@Controller("users")
export class UserController {

  constructor(
    private readonly users: UserService
  ) {}
}
```

The dependency graph is:

```text
UserController
      │
      ▼
 UserService
      │
      ▼
DatabaseService
```

The container recursively resolves dependencies.

## Important runtime/build-time distinction

TypeScript/Bun does **not** automatically turn:

```ts
constructor(database: DatabaseService)
```

into a runtime request for a `DatabaseService` instance.

The framework must establish this relationship.

The Vite analyzer therefore discovers the dependency and generates metadata that the runtime container consumes.

---

# 10. Constructor Dependency Metadata

Every injectable constructor parameter must have a corresponding dependency definition.

Example:

```ts
class UserService {
  constructor(
    logger: LoggerService,
    database: DatabaseService
  ) {}
}
```

Conceptually generated metadata:

```ts
{
  token: UserService,
  dependencies: [
    {
      index: 0,
      token: LoggerService
    },
    {
      index: 1,
      token: DatabaseService
    }
  ]
}
```

The index is essential.

A graph containing only:

```text
UserService → LoggerService
UserService → DatabaseService
```

does not tell the runtime which constructor position receives which dependency.

The runtime effectively performs:

```ts
const args = [];

for (const dependency of metadata.dependencies) {
  args[dependency.index] =
    container.resolve(dependency.token);
}

return new UserService(...args);
```

Where all constructor parameters are ordinary DI parameters, the generated representation may be optimized to:

```ts
dependencies: [
  LoggerService,
  DatabaseService
]
```

because array position itself represents the index.

The semantic model nevertheless remains indexed.

---

# 11. Constructor Injection

Constructor injection is the primary mechanism for application-level dependencies.

```ts
class UserController {
  constructor(
    private users: UserService,
    private logger: LoggerService
  ) {}
}
```

The framework creates the controller rather than requiring developers to manually instantiate it.

---

# 12. Constructor Injection with `@Inject()`

Type-based automatic DI should be the default where the analyzer can resolve the referenced class.

Explicit tokens should be available when a dependency is not represented by a directly injectable class.

```ts
export const APP_CONFIG =
  createToken<AppConfig>("APP_CONFIG");

@Service()
export class UserService {

  constructor(
    @Inject(APP_CONFIG)
    private config: AppConfig
  ) {}
}
```

The analyzer records the token relationship.

Conceptually:

```ts
{
  index: 0,
  token: APP_CONFIG
}
```

`@Inject()` therefore does not mean "DI only happens when `@Inject()` is present."

Rather:

- class-type dependencies can be inferred automatically;
- `@Inject()` provides explicit token selection when inference is insufficient or the developer wants to override it.

---

# 13. Singleton Services

Core supports singleton lifetimes.

```ts
@Service({
  scope: "singleton"
})
export class DatabaseService {}
```

A singleton means:

> One instance per application/container scope.

```text
resolve(DatabaseService)
        │
        ▼
   instance #1

resolve(DatabaseService)
        │
        ▼
   instance #1
```

It does not imply a global static instance across unrelated containers.

---

# 14. Transient Services

Core supports transient lifetimes.

```ts
@Service({
  scope: "transient"
})
export class SomeService {}
```

Each resolution creates a new instance.

```text
resolve()
  ↓
instance #1

resolve()
  ↓
instance #2
```

Initial scopes:

- `singleton`
- `transient`

Additional scopes can be added later.

---

# 15. Providers

Providers are a first-class Core concept.

A provider can represent:

- a class
- a value
- a factory
- an alias
- an existing instance

Conceptually:

```ts
container.provide({
  token: Database,
  useFactory: () => createDatabase(config)
});
```

Providers are especially important for adapters because an adapter can contribute platform-specific dependencies without placing them in Core.

---

# 16. Values and Tokens

Not every dependency is a class.

The container supports values and tokens:

```ts
export const APP_CONFIG =
  createToken<AppConfig>("APP_CONFIG");

container.value(APP_CONFIG, config);
```

A class can consume it:

```ts
constructor(
  @Inject(APP_CONFIG)
  private config: AppConfig
) {}
```

This supports:

- configuration
- constants
- runtime state
- infrastructure handles
- external objects
- aliases

---

# 17. Explicit Container Registration

Automatic discovery is not the only registration mechanism.

Examples:

```ts
container.singleton(DatabaseService);
```

```ts
container.bind(LoggerService, FileLoggerService);
```

```ts
container.bind(DatabaseService, () => {
  return new DatabaseService(config.database);
});
```

Explicit registrations can override convention-based registrations when the application composition rules permit it.

---

# 18. Registration Precedence

The framework should define deterministic precedence.

The intended model is:

```text
Framework defaults
      ↓
Auto-discovered metadata
      ↓
Adapter-provided registrations
      ↓
bootstrap.ts explicit registrations
      ↓
Runtime overrides, where explicitly supported
```

The exact conflict rules should be documented and enforced.

An explicit application registration should normally be able to replace an automatically discovered implementation.

---

# 19. `bootstrap.ts`

`bootstrap.ts` is the **composition root** of an application.

It gives developers explicit control over application configuration.

Conceptually:

```ts
export default defineApp({
  providers: [
    DatabaseService,
    ConfigService,
  ],

  singletons: [
    EventBus,
    AppState,
  ],
});
```

It can also select and configure the adapter:

```ts
export default defineApp({
  adapter: electrobun(),

  providers: [
    DatabaseService,
  ],
});
```

Automatic discovery handles conventions.

`bootstrap.ts` handles explicit configuration and application composition.

---

# 20. Automatic Discovery + Bootstrap

These mechanisms work together:

```text
Automatic discovery
        +
bootstrap.ts
        +
adapter configuration
        ↓
Application Registry
        ↓
Dependency Container
```

Developers should not have to choose between convention and configuration.

---

# 21. Dependency Graph Generation

The Vite plugin analyzes constructors and explicit injection metadata.

Example:

```ts
@Service()
export class DatabaseService {}

@Service()
export class UserService {

  constructor(
    database: DatabaseService
  ) {}
}

@Controller("users")
export class UserController {

  constructor(
    users: UserService
  ) {}
}
```

The generated graph is conceptually:

```text
UserController
  parameter 0 → UserService
                   │
                   └── parameter 0 → DatabaseService
```

The graph must preserve parameter positions.

---

# 22. Method Parameter Injection

Constructor injection and method parameter injection are distinct mechanisms.

Example:

```ts
@Route("save")
save(
  @Body() data: SaveData,
  @Window() window: BrowserWindow,
  @Inject(AuditService) audit: AuditService
) {}
```

Conceptually generated metadata:

```ts
{
  method: "save",

  parameters: [
    {
      index: 0,
      resolver: "body"
    },
    {
      index: 1,
      resolver: "electrobun.window"
    },
    {
      index: 2,
      resolver: "container",
      token: AuditService
    }
  ]
}
```

The runtime must preserve the index.

---

# 23. Parameter Resolution Model

Parameter decorators are metadata declarations.

They should not directly resolve their values.

The flow is:

```text
Parameter decorator
        ↓
Parameter metadata
        ↓
Invocation engine
        ↓
Registered resolver
        ↓
Resolved argument
```

For example:

```text
@Window()
    ↓
"electrobun.window"
    ↓
Electrobun adapter resolver
    ↓
BrowserWindow
```

This keeps decorators independent of runtime resolution.

---

# 24. Resolver Tokens

Generated metadata should preferably reference stable resolver identifiers rather than embedding runtime resolver functions.

Example:

```ts
{
  index: 1,
  source: "adapter",
  resolver: "electrobun.window"
}
```

The Electrobun adapter registers:

```text
"electrobun.window"
        ↓
WindowResolver
```

This gives a clean build-time/runtime boundary.

Resolver identifiers should be namespaced to avoid collisions.

---

# 25. Method Invocation Pipeline

For an endpoint method:

```text
Incoming invocation
        ↓
Endpoint metadata
        ↓
Controller resolution
        ↓
Parameter metadata
        ↓
Parameter resolvers
        ↓
args[]
        ↓
Middleware
        ↓
method(...args)
        ↓
Transport result
```

Parameter resolution must occur in the correct parameter indexes.

---

# 26. Parameter Sources

A method parameter can originate from different sources.

Examples:

```text
Container
Transport payload
Transport argument
Platform object
Application context
Custom resolver
```

Example:

```ts
@Route("save")
save(
  @Body() data: SaveDto,
  @Window() window: BrowserWindow,
  @Inject(APP_CONFIG) config: AppConfig
) {}
```

Conceptually:

```text
index 0 → transport/body
index 1 → adapter/electrobun.window
index 2 → container/APP_CONFIG
```

---

# 27. Core Parameter Decorators

Core should only define parameter decorators with genuinely generic semantics.

Examples:

```ts
@Inject()
```

Potential generic transport abstractions may be provided by Core where appropriate, but transport-specific concepts should remain adapter-owned.

---

# 28. Adapter Parameter Decorators

Electrobun can contribute:

```ts
@Window()
@Webview()
@Context()
```

These map to Electrobun-specific resolvers.

Core does not need to know what `BrowserWindow` or `Webview` means.

---

# 29. Adapter System

Adapters are first-class Core extensions.

An adapter represents an integration between the framework and an external runtime/platform.

Examples could eventually include:

```text
Electrobun
Electron
Tauri
Node
HTTP
CLI
```

An application normally selects the adapter appropriate for its runtime.

The point is extensibility, not requiring unrelated adapters to operate simultaneously.

---

# 30. Adapter Responsibilities

An adapter can contribute:

```text
Decorators
Parameter decorators
Providers
Parameter resolvers
Transports
Lifecycle hooks
Compiler extensions
Metadata handlers
Runtime services
```

Conceptually:

```ts
defineAdapter({
  name: "electrobun",

  decorators: [
    RouteDecorator,
    MessageDecorator,
    WindowDecorator,
    WebviewDecorator,
  ],

  providers: [
    BrowserWindowProvider,
    WebviewProvider,
  ],

  resolvers: [
    WindowResolver,
    WebviewResolver,
    ContextResolver,
  ],

  compiler: [
    ElectrobunRpcCompiler,
  ],

  transports: {
    rpc: electrobunRpcTransport,
  },
});
```

The exact API is subject to implementation.

---

# 31. Adapter Build-Time and Runtime Model

An adapter participates in two major parts of the system:

```text
                     Adapter
                        │
             ┌──────────┴──────────┐
             │                     │
        Build-time               Runtime
             │                     │
             ▼                     ▼
       Source analysis         Container
       Metadata generation     Providers
       Validation              Resolvers
       Registry generation     Transport
```

This prevents Vite and Core from becoming hard-coded around Electrobun.

---

# 32. Vite Plugin

The Vite integration is a separate package.

Its responsibilities include:

- source discovery
- class/decorator analysis
- dependency graph construction
- parameter metadata extraction
- adapter compiler integration
- validation
- registry generation
- development-time diagnostics
- generated TypeScript integration

It should not own the runtime dependency container.

It prepares information the runtime consumes.

---

# 33. Vite Discovery

The Vite plugin can scan conventional locations:

```text
controllers/**/*.ts
services/**/*.ts
providers/**/*.ts
middleware/**/*.ts
```

It identifies classes and metadata using TypeScript source analysis.

Example:

```ts
@Service()
export class UserService {

  constructor(
    private database: DatabaseService
  ) {}
}
```

The analyzer records:

```text
UserService
  constructor parameter 0
      ↓
DatabaseService
```

---

# 34. Generated Registry

The Vite plugin generates an internal module containing application metadata.

Conceptually:

```ts
export const applicationRegistry = {
  controllers: [
    {
      token: UserController,
      scope: "singleton",
      routes: {
        get: "getUser",
      },
    },
  ],

  services: [
    {
      token: UserService,
      scope: "singleton",
      dependencies: [
        {
          index: 0,
          token: DatabaseService,
        },
      ],
    },
  ],
};
```

The generated module is an implementation detail and should not need manual editing.

---

# 35. Generated Endpoint Metadata

Endpoint metadata should preserve:

- controller token
- method name
- endpoint path
- endpoint kind
- parameter metadata
- middleware metadata
- adapter/transport metadata

Conceptually:

```ts
{
  controller: UserController,
  method: "getUser",
  path: "users/get",
  kind: "request",

  parameters: [
    {
      index: 0,
      resolver: "electrobun.arg",
      argumentIndex: 0
    }
  ]
}
```

---

# 36. Why Build-Time Discovery?

Avoid runtime filesystem discovery:

```text
Scan filesystem
     ↓
Find files
     ↓
Import files
     ↓
Inspect classes
     ↓
Discover metadata
     ↓
Construct registry
```

Prefer:

```text
Vite
  ↓
Scan source
  ↓
Analyze
  ↓
Validate
  ↓
Generate registry
  ↓
Bundle
```

At runtime:

```text
Load generated registry
        ↓
Create container
        ↓
Register dependencies
        ↓
Initialize adapter
        ↓
Register endpoints
```

---

# 37. AST / Source Analysis

The Vite plugin can analyze TypeScript source directly.

For:

```ts
@Service()
export class UserService {

  constructor(
    private database: DatabaseService
  ) {}
}
```

the analyzer can identify:

```text
UserService
    ↓
parameter 0
    ↓
DatabaseService
```

For:

```ts
constructor(
  @Inject(APP_CONFIG)
  config: AppConfig
) {}
```

the explicit token takes precedence over inferred class metadata.

---

# 38. Dependency Graph Validation

The generated graph can look like:

```text
UserController
      │
      └── UserService
              │
              ├── DatabaseService
              │
              └── EventBus
```

The build process should detect where possible:

- missing dependencies
- circular dependencies
- duplicate registrations
- invalid providers
- invalid controller definitions
- invalid routes
- unsupported decorator combinations
- invalid parameter metadata
- invalid adapter metadata
- unresolved injection tokens

Diagnostics should identify the source file and parameter index where possible.

---

# 39. Circular Dependencies

The dependency graph should explicitly detect cycles.

Example:

```text
A → B
B → C
C → A
```

The framework should report the dependency chain instead of failing with an opaque runtime error.

Whether some cycles are later supported through lazy providers is a future consideration.

---

# 40. Electrobun Adapter

The Electrobun package is a platform adapter, not part of Core.

It contributes Electrobun-specific functionality such as:

```text
BrowserWindow provider
Webview provider
RPC transport
Message transport
RPC context
Window resolver
Webview resolver
Route decorator
Message decorator
Electrobun compiler extension
```

---

# 41. Requests

In the Electrobun adapter, requests represent call-and-response RPC operations.

```ts
@Controller("users")
export class UserController {

  @Route("get")
  async getUser(id: string) {
    return {
      id,
      name: "Davy",
    };
  }
}
```

The Electrobun adapter maps:

```text
users/get
```

to the appropriate Electrobun request endpoint.

---

# 42. Messages

The Electrobun adapter exposes a distinct fire-and-forget message primitive.

```ts
@Controller("analytics")
export class AnalyticsController {

  @Message("click")
  trackClick(buttonId: string) {
    console.log(buttonId);
  }
}
```

The adapter maps:

```text
analytics/click
```

to the appropriate Electrobun message mechanism.

No response contract is expected.

---

# 43. Requests vs Messages

| Feature | Request | Message |
|---|---|---|
| Electrobun decorator | `@Route()` | `@Message()` |
| Response | Yes | No |
| Return value | Meaningful | Not part of contract |
| Caller awaits result | Yes | No |
| Suitable for queries | Yes | No |
| Suitable for commands requiring a result | Yes | Usually no |
| Suitable for telemetry/events | Usually no | Yes |
| Suitable for notifications | Usually no | Yes |

The distinction represents communication semantics.

It should not be described as "blocking the browser thread." Awaiting a request is asynchronous; the distinction is whether the caller has a response contract.

---

# 44. Controller Prefix + Endpoint Registration

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

the adapter receives:

```text
Request:
users/get

Message:
users/deleted
```

The adapter then transforms these into the native Electrobun registration structures.

---

# 45. Parameter Decorators

The framework supports parameter injection.

Example:

```ts
@Route("title")
getTitle(
  @Window() window: BrowserWindow
) {
  return window.title;
}
```

The caller does not supply the `BrowserWindow`.

The Electrobun adapter resolves it.

---

# 46. `@Body()`

Where the selected transport exposes a body/payload concept, `@Body()` represents that payload.

```ts
@Message("save")
save(
  @Body() data: SaveFileDto
) {}
```

The adapter determines how the incoming transport payload is mapped to the parameter.

If Electrobun's native RPC API uses positional arguments rather than an HTTP-like body, the Electrobun implementation may map `@Body()` to the appropriate payload abstraction.

The framework should not assume HTTP semantics merely because the decorator is called `@Body()`.

---

# 47. `@Arg()`

Individual transport arguments can be accessed through a parameter decorator.

```ts
@Route("get")
getUser(
  @Arg(0) id: string
) {}
```

Conceptual metadata:

```ts
{
  index: 0,
  resolver: "electrobun.arg",
  argumentIndex: 0
}
```

The adapter maps the incoming argument index to the method parameter.

---

# 48. Electrobun Infrastructure Injection

The Electrobun adapter can provide resolvers for infrastructure objects:

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

These are resolved by the adapter and are not ordinary application services.

---

# 49. Core DI vs Platform Parameter Resolution

The framework distinguishes:

```text
Application dependencies
```

from:

```text
Platform-provided parameters
```

For:

```ts
constructor(
  private users: UserService
) {}
```

the container performs ordinary Core DI.

For:

```ts
getTitle(
  @Window() window: BrowserWindow
) {}
```

the adapter supplies a parameter resolver.

Both eventually feed arguments into the same invocation engine.

---

# 50. Runtime Invocation

The generic invocation engine should conceptually perform:

```ts
const args: unknown[] = [];

for (const parameter of endpoint.parameters) {
  args[parameter.index] =
    resolveParameter(parameter, invocationContext);
}

await invoke(
  controllerInstance,
  endpoint.method,
  args
);
```

`resolveParameter()` can delegate to:

```text
container
adapter resolver
transport resolver
custom resolver
```

The engine must never assume that every parameter comes from DI.

---

# 51. Middleware

Middleware is a Core capability.

Adapters determine how their transports enter the middleware pipeline.

Potential levels:

```text
Application middleware
Controller middleware
Endpoint middleware
Message middleware
```

Example:

```ts
@Use(loggingMiddleware)
@Route("get")
getUser() {}
```

Middleware can handle:

- logging
- validation
- authorization
- telemetry
- timing
- auditing
- error handling

---

# 52. Request and Message Middleware

Request middleware may have a response-aware lifecycle:

```text
Request
  ↓
middleware
  ↓
handler
  ↓
response
  ↓
middleware
```

Messages have no response phase:

```text
Message
  ↓
middleware
  ↓
handler
```

The framework preserves this semantic difference.

---

# 53. Application Lifecycle

Core provides application lifecycle management.

```text
Create application
      ↓
Load generated registry
      ↓
Create container
      ↓
Register providers
      ↓
Initialize adapter
      ↓
Initialize application services
      ↓
Register endpoints
      ↓
Application running
      ↓
Shutdown
      ↓
Dispose resources
```

Adapters may contribute lifecycle hooks.

---

# 54. Bootstrap Hooks

`bootstrap.ts` can expose lifecycle hooks:

```ts
export default defineApp({

  async onBootstrap(container) {
    const database = container.get(DatabaseService);

    await database.connect();
  },

  async onShutdown(container) {
    const database = container.get(DatabaseService);

    await database.close();
  }
});
```

---

# 55. Service Lifecycle

Services may eventually support lifecycle interfaces:

```ts
interface OnBootstrap {
  onBootstrap(): Promise<void> | void;
}

interface OnShutdown {
  onShutdown(): Promise<void> | void;
}
```

Example:

```ts
@Service()
export class DatabaseService implements OnBootstrap, OnShutdown {

  async onBootstrap() {
    // connect
  }

  async onShutdown() {
    // disconnect
  }
}
```

Lifecycle invocation must respect dependency initialization order where applicable.

---

# 56. Outgoing Communication

Electrobun also supports Bun → Webview communication.

The framework should distinguish incoming endpoints from outgoing communication.

Conceptually:

```text
                    Communication
                         │
           ┌─────────────┼─────────────┐
           │             │             │
       Request        Message       Outgoing
           │             │           Event
           │             │             │
     Webview → Bun  Webview → Bun  Bun → Webview
```

Requests and incoming messages map naturally to controller endpoint decorators.

Outgoing events should be represented as an adapter/runtime capability.

The exact API should follow the actual Electrobun API rather than inventing a competing transport.

---

# 57. Shared Type Safety

Controller definitions should contribute to generated RPC contracts.

For:

```ts
@Route("get")
async getUser(id: string): Promise<User> {}
```

the generated contract should be equivalent to:

```ts
"users/get": (
  id: string
) => Promise<User>
```

For:

```ts
@Message("deleted")
deleted(id: string): void {}
```

the generated contract should be equivalent to:

```ts
"users/deleted": (
  id: string
) => void
```

The framework should eliminate duplicated manual RPC definitions wherever the compiler can safely generate them.

---

# 58. Frontend API

The initial API can remain close to Electrobun:

```ts
rpc.request("users/get", id);
```

```ts
rpc.message("users/deleted", id);
```

A later stage may generate higher-level APIs:

```ts
rpc.users.get(id);
```

```ts
rpc.users.deleted(id);
```

The generated API must preserve the underlying transport semantics.

---

# 59. Decorator Categories

## Core class decorators

```ts
@Controller()
@Service()
@Provider()
```

## Core injection

```ts
@Inject()
```

## Core method/application decorators

Only decorators with genuinely framework-wide semantics should live in Core.

Example:

```ts
@Use()
```

## Adapter method decorators

Electrobun:

```ts
@Route()
@Message()
```

## Adapter parameter decorators

Electrobun:

```ts
@Window()
@Webview()
@Context()
@Arg()
```

Transport-generic decorators may eventually be moved into a shared transport abstraction if their semantics prove sufficiently universal.

---

# 60. Recommended Application Structure

```text
src/
│
├── bun/
│   │
│   ├── controllers/
│   │   ├── user.controller.ts
│   │   ├── file.controller.ts
│   │   └── window.controller.ts
│   │
│   ├── services/
│   │   ├── user.service.ts
│   │   ├── file.service.ts
│   │   └── database.service.ts
│   │
│   ├── providers/
│   │   └── config.provider.ts
│   │
│   ├── middleware/
│   │   ├── logging.ts
│   │   └── validation.ts
│   │
│   ├── bootstrap.ts
│   └── main.ts
│
├── web/
│   └── ...
│
└── shared/
    ├── types.ts
    └── rpc.ts
```

`bun/` is an application convention for the Electrobun adapter, not a Core requirement.

---

# 61. Complete Electrobun Controller Example

```ts
@Controller("files")
export class FileController {

  constructor(
    private readonly files: FileService,
    private readonly logger: LoggerService
  ) {}

  @Route("read")
  async read(
    @Arg(0) path: string
  ) {
    return this.files.read(path);
  }

  @Route("save")
  async save(
    @Body() data: SaveFileDto,
    @Window() window: BrowserWindow
  ) {
    const result = await this.files.save(data);

    // Outgoing communication should use the actual
    // Electrobun adapter/runtime API.

    return result;
  }

  @Message("opened")
  opened(
    @Body() path: string
  ) {
    this.logger.info(`Opened: ${path}`);
  }
}
```

---

# 62. Example Service Graph

```ts
@Service({
  scope: "singleton"
})
export class DatabaseService {}

@Service({
  scope: "singleton"
})
export class FileService {

  constructor(
    private database: DatabaseService
  ) {}
}

@Controller("files")
export class FileController {

  constructor(
    private files: FileService
  ) {}
}
```

The container resolves:

```text
FileController
      │
      ▼
 FileService
      │
      ▼
DatabaseService
```

---

# 63. Example Bootstrap

```ts
export default defineApp({
  adapter: electrobun(),

  providers: [
    DatabaseService,
    FileService,
  ],

  singletons: [
    EventBus,
    ApplicationState,
  ],

  values: {
    APP_NAME: "My Electrobun App"
  },

  async onBootstrap(container) {
    const database = container.get(DatabaseService);

    await database.connect();
  },

  async onShutdown(container) {
    const database = container.get(DatabaseService);

    await database.close();
  }
});
```

---

# 64. Bootstrap as Composition Root

`bootstrap.ts` is not merely a list of classes.

It is the place where automatic application discovery and explicit developer configuration are composed.

Conceptually:

```text
                 Generated Metadata
                        │
                        ▼
                Auto registrations
                        │
                        ▼
                 bootstrap.ts
                        │
             ┌──────────┴──────────┐
             │                     │
          overrides             additions
             │                     │
             └──────────┬──────────┘
                        ▼
                 Final container
```

This allows patterns such as:

```ts
export default defineApp({
  providers: [
    {
      token: LoggerService,
      useClass: ProductionLogger,
    }
  ]
});
```

while still allowing the build system to discover the rest of the application automatically.

---

# 65. Provider Factories

Factories can receive container dependencies.

Conceptually:

```ts
{
  token: Database,
  useFactory: (config: AppConfig) => {
    return createDatabase(config);
  },
  inject: [APP_CONFIG]
}
```

The factory's injection metadata must also preserve dependency positions.

The same principle applies:

```text
factory parameter 0 → APP_CONFIG
factory parameter 1 → LoggerService
```

---

# 66. Provider Aliases

The container should support aliases.

Example:

```ts
container.alias(
  "Database",
  DatabaseService
);
```

or:

```ts
{
  token: Database,
  useExisting: DatabaseService
}
```

An alias must resolve to the same underlying instance when the target provider is singleton-scoped.

---

# 67. Existing Instances

The application can provide an already-created object:

```ts
const database = createDatabase();

export default defineApp({
  providers: [
    {
      token: DatabaseService,
      useValue: database
    }
  ]
});
```

This is particularly useful for objects owned by a platform runtime.

---

# 68. Platform-Owned Objects

Platform objects such as `BrowserWindow` may be created outside the Core container.

The adapter can expose them through:

- providers
- scoped context
- parameter resolvers
- runtime handles

The important distinction is ownership.

For example:

```text
Electrobun creates BrowserWindow
             ↓
Electrobun adapter owns lifecycle
             ↓
Framework exposes access
             ↓
@Window() resolves it
```

Core must not attempt to construct a `BrowserWindow`.

---

# 69. Security Boundary

Controllers execute in the privileged Bun side of an Electrobun application.

The framework should therefore favor explicit endpoint exposure.

A method should **not automatically become an RPC endpoint merely because it is public**.

```ts
@Controller("users")
class UserController {

  @Route("get")
  getUser() {}

  internalCalculation() {}

  privateInternalMethod() {}
}
```

Only:

```text
users/get
```

is exposed through the Electrobun adapter.

---

# 70. Endpoint Metadata Model

The generic endpoint model should be capable of representing:

```ts
{
  controller: ControllerToken,

  method: "getUser",

  path: "users/get",

  kind: "request",

  parameters: [
    {
      index: 0,
      source: "transport",
      resolver: "electrobun.arg",
      argumentIndex: 0
    }
  ],

  middleware: []
}
```

The adapter converts this generic metadata into its native registration representation.

---

# 71. Message Endpoint Metadata

A message endpoint differs primarily in transport semantics:

```ts
{
  controller: AnalyticsController,

  method: "trackClick",

  path: "analytics/click",

  kind: "message",

  parameters: [
    {
      index: 0,
      source: "transport",
      resolver: "electrobun.arg",
      argumentIndex: 0
    }
  ]
}
```

The runtime should know that no response contract is expected.

---

# 72. Runtime Architecture

```text
                           Application
                                │
                         bootstrap.ts
                                │
                    ┌───────────┴───────────┐
                    │                       │
              Auto Discovery          Explicit Config
                    │                       │
                    └───────────┬───────────┘
                                │
                           Vite Plugin
                                │
                     Generated App Graph
                                │
                         Selected Adapter
                                │
                    ┌───────────┴───────────┐
                    │                       │
              Core Registry          Adapter Registry
                    │                       │
                    └───────────┬───────────┘
                                │
                         DI Container
                                │
                ┌───────────────┼────────────────┐
                │               │                │
           Singleton        Transient       Factories
                │               │                │
                └───────────────┼────────────────┘
                                │
                         Invocation Engine
                                │
                    ┌───────────┴───────────┐
                    │                       │
              Constructor             Endpoint Method
              Resolution                 Resolution
                    │                       │
                    │              ┌────────┼─────────┐
                    │              │        │         │
                    │           Container Adapter  Transport
                    │           resolver  resolver  resolver
                    │              │        │         │
                    └──────────────┴────────┴─────────┘
                                │
                             args[]
                                │
                           Middleware
                                │
                         Controller Method
                                │
                         Adapter Transport
                                │
                           Electrobun
```

---

# 73. Full Build-Time Architecture

```text
                         TypeScript Source
                                │
                                ▼
                         Vite Framework
                            Plugin
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
          File Scan         Core Analyzer     Adapter Analyzer
              │                 │                 │
              │            @Service()          @Route()
              │            @Controller()        @Message()
              │            @Inject()            @Window()
              │                                 @Webview()
              │
              └─────────────────┬─────────────────┘
                                │
                                ▼
                       Application Metadata
                                │
               ┌────────────────┼────────────────┐
               │                │                │
               ▼                ▼                ▼
        Dependency Graph   Endpoint Graph   Parameter Graph
               │                │                │
               └────────────────┼────────────────┘
                                ▼
                           Validation
                                │
                                ▼
                        Generated Registry
                                │
                                ▼
                              Bundle
```

---

# 74. Final Layered Architecture

```text
┌────────────────────────────────────────────┐
│                Application                 │
│                                            │
│ Controllers / Services / Providers         │
└───────────────────────┬────────────────────┘
                        │
┌───────────────────────▼────────────────────┐
│                 Framework Core              │
│                                            │
│ Container / DI / Lifecycle / Middleware    │
│ Metadata / Decorators / Providers          │
│ Invocation Engine / Adapter API            │
└───────────────────────┬────────────────────┘
                        │
┌───────────────────────▼────────────────────┐
│              Build Integration              │
│                                            │
│ Vite / Scanner / Analyzer / Generator      │
│ Dependency Graph / Validation               │
│ Adapter Compiler Extensions                │
└───────────────────────┬────────────────────┘
                        │
┌───────────────────────▼────────────────────┐
│             Platform Adapter                │
│                                            │
│ Electrobun Decorators / Resolvers          │
│ Providers / RPC / Lifecycle / Compiler     │
└───────────────────────┬────────────────────┘
                        │
┌───────────────────────▼────────────────────┐
│                 Electrobun                 │
│                                            │
│ Bun ↔ Webview runtime and native RPC       │
└────────────────────────────────────────────┘
```

---

# 75. Intended Developer Experience

An Electrobun developer should be able to write:

```ts
@Service()
export class UserService {

  constructor(
    private database: DatabaseService
  ) {}

  async find(id: string) {
    return this.database.users.find(id);
  }
}
```

and:

```ts
@Controller("users")
export class UserController {

  constructor(
    private users: UserService
  ) {}

  @Route("get")
  get(
    @Arg(0) id: string
  ) {
    return this.users.find(id);
  }

  @Message("selected")
  selected(
    @Arg(0) id: string
  ) {
    console.log("Selected:", id);
  }
}
```

without manually constructing:

```ts
new DatabaseService()
new UserService(...)
new UserController(...)
```

or manually maintaining:

```ts
defineRpc({
  handlers: {
    "users/get": ...,
    "users/selected": ...
  }
})
```

The framework discovers, analyzes, wires, validates, and registers the application.

---

# 76. Architectural Invariants

The following should be treated as core architectural rules.

1. **Core never imports a platform adapter.**
2. **Platform-specific decorators belong to adapters unless their semantics are genuinely generic.**
3. **Build-time analysis may generate runtime metadata, but runtime should not need to rediscover the source tree.**
4. **Every injectable constructor parameter has a positional meaning.**
5. **Every injectable method parameter has an explicit parameter index in metadata.**
6. **Parameter decorators declare resolution strategy; resolvers perform resolution.**
7. **TypeScript type annotations alone are not assumed to provide runtime DI.**
8. **`@Inject()` is explicit token selection, not the requirement for all DI.**
9. **Automatic discovery and explicit bootstrap registration coexist.**
10. **Explicit application configuration must have deterministic precedence over discovered defaults.**
11. **Platform-owned objects must remain owned by their platform adapter/runtime.**
12. **Controllers only expose explicitly decorated endpoints.**
13. **Requests and messages are distinct transport semantics.**
14. **Generated metadata should use stable identifiers for adapter-specific resolvers where practical.**
15. **The container owns application dependency lifetimes; adapters own platform lifetimes where appropriate.**
16. **The adapter participates in both build-time compilation and runtime integration.**
17. **Generated RPC contracts should be derived from controller metadata whenever safely possible.**
18. **The framework must not pretend to replace the underlying platform runtime.**

---

# 77. Long-Term Direction

The immediate target is Electrobun, but the framework should remain platform-extensible.

```text
                    Framework Core
                          │
                    Adapter API
                          │
          ┌───────────────┼───────────────┐
          │               │               │
     Electrobun        Electron        Tauri
      Adapter          Adapter         Adapter
          │
          ├── Decorators
          ├── Providers
          ├── Resolvers
          ├── Compiler extensions
          ├── Transport
          └── Lifecycle
```

An application normally selects the adapter appropriate for its environment.

The point is not to make unrelated platform adapters operate simultaneously.

The point is to make Core extensible enough that a platform can integrate cleanly without becoming part of Core itself.

---

# 78. Final Summary

The project is a **TypeScript application framework and application kernel**, initially optimized for Electrobun.

Its central architecture is:

1. **Core** provides controllers, services, dependency injection, providers, scopes, tokens, lifecycle, middleware, invocation, metadata, and the adapter extension API.
2. **Adapters** extend Core with platform-specific decorators, providers, parameter resolvers, transports, lifecycle behavior, and compiler integrations.
3. **Electrobun is the first adapter**, providing RPC requests, messages, BrowserWindow/Webview injection, Electrobun-specific decorators, and native RPC integration.
4. **Vite is the build integration**, responsible for scanning source files, analyzing metadata, building dependency and endpoint graphs, validating the application, invoking adapter compiler extensions, and generating the application registry.
5. **`bootstrap.ts` is the composition root**, allowing developers to explicitly configure providers, scopes, values, factories, middleware, lifecycle hooks, and the selected adapter.
6. **The DI container is runtime infrastructure**, while generated registry metadata supplies the information needed to construct the application efficiently.
7. **Constructor dependency metadata preserves parameter positions**, ensuring the container knows exactly which dependency belongs to which constructor argument.
8. **Method parameter metadata independently preserves parameter indexes**, because method parameters can be supplied by multiple sources.
9. **`@Inject()` is explicit token selection**, while ordinary class dependencies can be inferred during build-time analysis.
10. **Parameter decorators are metadata declarations**, while registered resolvers perform actual runtime resolution.
11. **Adapter resolver identifiers create a clean build-time/runtime boundary**, allowing generated metadata to refer to platform capabilities without embedding runtime implementation objects.
12. **RPC routes and messages are adapter concepts**, because their meaning depends on the underlying transport.
13. **Build-time analysis replaces runtime filesystem discovery**, minimizing runtime overhead and enabling validation before execution.
14. **Generated TypeScript metadata and RPC contracts provide strong type safety** without requiring developers to maintain duplicate registration structures.
15. **Electrobun remains the underlying runtime and transport**, rather than being replaced by the framework.

The intended developer mental model is:

```text
Controllers
Services
Dependencies
Providers
Lifecycle
Middleware
Application composition
```

while the framework handles:

```text
Discovery
Dependency wiring
Dependency graph generation
Metadata
Validation
RPC registration
Parameter resolution
Middleware execution
Platform integration
```

and Electrobun continues to handle:

```text
Windows
Webviews
Native desktop functionality
Bun runtime
Underlying RPC transport
```

That separation is the foundation of the project.
