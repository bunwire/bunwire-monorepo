# `@bunwire/bun`

`@bunwire/bun` is Bunwire's first-party **application runtime for Bun**.

Its purpose is not merely to provide another HTTP routing library around `Bun.serve()`. It is intended to provide the application-level framework experience around Bun: HTTP controllers, middleware, request validation, sessions, CSRF, authentication and authorization, server-driven pages, Core event/listener integration, jobs and queues, scheduling, commands, WebSockets, Core lifecycle participation, and the runtime infrastructure required to execute all of those features coherently.

The general philosophy is:

> **Use Bun for what Bun already does well, and use Bunwire to provide application structure, compiler integration, managed classes, dependency injection, registries, lifecycle management, and developer ergonomics.**

Bunwire should not unnecessarily replace mature ecosystem libraries or duplicate low-level Bun functionality.

---

# 1. Package boundaries

Most Bun application features remain inside:

```text
@bunwire/bun
```

Runtime-independent events and direct managed listeners are now canonical `@bunwire/core` capabilities. Bun continues to own Bun-specific features such as:

```text
jobs
scheduling
execution scopes
queued-listener integration
```

Those Bun-specific systems will **not** be extracted prematurely.

The initial rule is:

```text
implement in @bunwire/bun
        ↓
use it in real applications
        ↓
stabilize semantics and APIs
        ↓
later evaluate generic extraction
```

The Core event API is already stable for Bun consumers:

```ts
@Event()
export class UserRegistered {}
```

uses Core identity, generated relationships, DI, and direct dispatch. Bun must consume that system rather than introduce parallel event decorators or a second dispatcher.

---

# 2. What `@bunwire/bun` does not provide

Bunwire will deliberately not become a database framework.

The following are out of scope:

```text
ORM
query builder
SQL abstraction
database models
migration framework
schema framework
Eloquent-style model binding
automatic Prisma model resolution
automatic Drizzle model resolution
```

Applications can use whatever persistence solution they want:

```text
Prisma
Drizzle
Kysely
Bun SQL
SQLite
Redis
custom repositories
external APIs
anything else
```

Bunwire DI can manage those clients and services normally.

There is also no planned Laravel-style automatic route model binding.

Laravel can provide unusually strong model binding because Eloquent gives it a canonical model abstraction. Bunwire deliberately does not own application models, so pretending to offer the same behavior would create complexity and coupling.

A third-party package or application is free to implement its own integration if desired.

---

# 3. Bunwire compiler philosophy

`@bunwire/bun` continues the architecture established by Bunwire Core.

Runtime reflection and startup discovery should not become the primary mechanism.

Bunwire should not do things like:

```text
glob source files
import every module
inspect decorators at application startup
discover listeners dynamically
discover jobs dynamically
discover commands dynamically
```

Instead:

```text
source
    ↓
Bunwire compiler
    ↓
canonical decorator resolution
    ↓
validation
    ↓
generated registries / invocation plans
    ↓
@bunwire/bun runtime
```

The Bun package consumes compiler-generated information.

This applies to:

```text
controllers
middleware
requests
events
listeners
jobs
schedules
commands
WebSocket handlers
```

The runtime executes known structures rather than rediscovering application architecture.

---

# 4. Canonical Bun-managed concepts

The Bun package is expected to introduce or own compiler-visible concepts approximately along these lines:

```ts
@Controller()
class ...

@Middleware()
class ...

@Request()
class ...

@Event()
class ...

@Listener(Event)
class ...

@Job({ id: "billing.generate-invoice" })
class ...

@Schedule(...)
class ...

@Command(...)
class ...

@WebSocket(...)
class ...
```

Each feature must be implemented using Bunwire's canonical identity and registry system rather than names, runtime duck typing, or inheritance scanning.

For example:

```ts
@Request()
export class CreateUserRequest extends FormRequest {}
```

The class is a Bunwire request because of:

```ts
@Request()
```

not merely because it extends `FormRequest`.

Likewise:

```ts
@Event()
class UserRegistered {}
```

receives canonical Bunwire identity rather than relying on:

```text
"UserRegistered"
```

as an arbitrary runtime string.

---

# 5. Core `Application` and `BunAdapter`

The Bun package integrates with the existing `@bunwire/core` `Application` through a class-based primary host adapter.

The bootstrap file configures and exports the Core Application without starting it:

```ts
import { defineApp } from "@bunwire/core";
import { BunAdapter } from "@bunwire/bun";

export default defineApp()
  .withAdapter(new BunAdapter({
    role: "http",
  }));
```

The Bun host entrypoint supplies the generated registry and crosses Core's public startup boundary exactly once:

```ts
import registry from "virtual:bunwire/registry";
import app from "./bootstrap";

await app
  .withRuntimeRegistry(registry)
  .start();
```

`BunAdapter` represents more than the HTTP server. The same Core Application configuration, container registrations, generated registry, and managed-class infrastructure may be started under different Bun runtime roles:

```text
Core Application
└── BunAdapter
    ├── http → HTTP server
    ├── worker → queue worker
    ├── scheduler → scheduler
    └── command → command process
```

These processes should share the same application configuration, container registrations, generated registry, and managed-class infrastructure while starting only the runtime systems they actually require.

A queue worker, for example, should not need to start `Bun.serve()`.

---

# 6. Application lifecycle

`@bunwire/core` owns Application lifecycle orchestration. `BunAdapter` participates in that lifecycle through the established adapter attachment, host preparation, registry consumption, startup, and resource-cleanup boundaries rather than maintaining a second application state machine.

Conceptually:

```text
defineApp() creates Core Application
 ↓
configure
 ↓
attach BunAdapter and generated registry
 ↓
app.start()
 ↓
Core prepares context and boots Providers
 ↓
BunAdapter starts selected runtime role
 ↓
running
 ↓
stopping
 ↓
graceful shutdown
 ↓
dispose
```

This lifecycle must support:

```text
HTTP server
workers
scheduler
commands
WebSocket connections
application services
```

Graceful shutdown is important.

For an HTTP process:

```text
stop accepting new work
        ↓
finish active work where appropriate
        ↓
dispose request/application resources
```

For a queue worker:

```text
stop reserving jobs
        ↓
finish/release current job appropriately
        ↓
dispose worker/application resources
```

Individual Bun subsystems should register their resources with the shared lifecycle. If Bun requires a generic shutdown/disposal capability that Core does not yet expose, that capability must be added to Core's Application/adapter lifecycle rather than implemented as a parallel Bun-owned application lifecycle.

Milestone 1 establishes that generic boundary as terminal `app.stop()`. `BunAdapter` uses it for exactly-once adapter cleanup and, by default, translates SIGINT/SIGTERM into graceful shutdown before restoring native signal termination. Applications that own process signals may disable that integration through adapter configuration.

---

# 7. Execution scopes

The application needs explicit execution scopes.

At minimum:

```text
application scope

HTTP request scope

queue job scope

command scope

scheduled task scope

WebSocket connection/message scope
```

This prevents request-specific or job-specific state from leaking into global application services.

For example:

```text
Application
    ↓
HTTP Request Scope
    ├── current request
    ├── session
    ├── authentication context
    ├── request-bound middleware
    ├── controller
    └── FormRequest
```

A job receives a separate execution scope:

```text
Application
    ↓
Job Scope
    ├── current job metadata
    ├── job instance
    └── job-specific scoped services
```

These scope concepts may eventually become useful enough to move into Core, but they will initially be developed for `@bunwire/bun`.

Milestone 2 implements these as public Bun-owned primitives over Core child containers. `BunExecutionScopeManager` owns one application scope and creates explicit `http-request`, `queue-job`, `command`, `scheduled-task`, `websocket-connection`, and `websocket-message` scopes. WebSocket message scopes must be children of a live connection scope; all other child kinds attach to the application scope.

Each scope exposes its child container through canonical scope resolution, supports generic typed contextual values, and can cache explicitly registered scoped services. Only resources registered through the scope API with an explicit disposer participate in scope cleanup; inherited Core/application singletons are never inferred to be disposable.

Managed scope execution uses `manager.run()`, which guarantees cleanup and preserves simultaneous handler/cleanup failures. Descendants and resolved resources dispose in reverse order, all cleanup is attempted, and multiple failures are aggregated. Application shutdown rejects new scopes, waits for active managed executions, disposes remaining manually created scopes, and then completes BunAdapter cleanup. No `AsyncLocalStorage` or global mutable current-context mechanism is used.

Milestone 3 introduces the concrete HTTP context token with the native request/server, compiled route identity, parameters, method, and current request scope. Job, command, scheduled-task, and WebSocket context tokens remain owned by their later feature milestones so their public types are not prematurely fixed as `unknown`.

---

# 8. HTTP runtime

The HTTP server uses Bun's native server runtime.

Conceptually:

```ts
Bun.serve({
  routes: {
    // compiler-generated Bunwire routes
  },
});
```

Bunwire should not emulate Express internally.

The compiler knows routes, methods and Core Controller targets, so the Bun runtime translates those structures directly into grouped native `{ path: { METHOD: handler } }` routes. Bun owns the HTTP method decorators; Core's canonical `@Controller()` remains the only Controller class identity.

Each managed route runs inside an `http-request` execution scope. Bun supplies that container as the parent of Core's invocation child so contextual bindings are visible to Provider boot, Controller DI, parameter resolvers, and middleware without becoming global. The initial response boundary accepts only native `Response`; result normalization and replaceable exception rendering arrive in Milestone 5.

The application's HTTP lifecycle should follow a deterministic flow:

```text
Bun.serve request
      ↓
create Bun request context
      ↓
create request execution scope
      ↓
resolve applicable middleware
      ↓
execute middleware pipeline
      ↓
resolve managed controller invocation
      ↓
resolve @Request() parameters
      ↓
request authorization / preparation / validation
      ↓
invoke controller
      ↓
normalize controller result
      ↓
middleware unwinds
      ↓
native Response
      ↓
dispose request scope
```

---

# 9. Bun request context

The native runtime request context and Bunwire's registered `@Request()` classes are different concepts.

A Bun HTTP context contains runtime state such as:

```text
native Request
server
URL
HTTP method
route parameters
query values
cookies
session
authenticated principal
request metadata
```

The Milestone 3 public shape is:

```ts
interface BunHttpContext {
  request: BunRequest;
  server: Server;
  route: {
    method: BunHttpMethod;
    path: string;
    params: Readonly<Record<string, string>>;
  };
  scope: BunExecutionScope;
}
```

It is frozen and available explicitly through Bun `@Context()` or the `BUN_HTTP_CONTEXT` runtime token. Query, cookie, session, auth, validation, and richer request facilities remain later milestones.

A class like:

```ts
@Request()
class CreateUserRequest extends FormRequest {}
```

is not the HTTP context itself.

It is a registered application request object constructed from that context.

---

# 10. Middleware

`@bunwire/bun` uses the middleware architecture already defined for Bunwire.

A Bun middleware might look like:

```ts
@Middleware()
export class AuthenticateMiddleware
  implements Middleware<BunMiddlewareContext>
{
  protected alias = "auth";

  async handle(context, next) {
    // ...

    return next();
  }
}
```

Middleware remains:

```text
managed
class-based
DI-enabled
aliasable
groupable
parameterizable
adapter/runtime-aware
```

It supports:

```text
include / exclude
→ actual case-sensitive URL pathname filtering

only / except
→ canonical uppercase HTTP method filtering
```

The frozen `BunMiddlewareContext` extends the native HTTP context with the actual pathname, canonical method, `transport: "http"`, current request scope, and immutable attachment parameters. Path patterns use `*` within one segment and `**` as a complete multi-segment wildcard; query strings and fragments do not participate.

and middleware references such as:

```ts
@Use("auth:admin")
```

Built-in framework functionality should use this same middleware system wherever appropriate.

Bunwire's own middleware should not secretly bypass the public middleware pipeline.

Generated middleware executes in deterministic global, centralized Controller mapping, Controller `@Use`, then method `@Use` order. Identical target-plus-parameter attachments are deduplicated at their earliest position while parameter-distinct attachments remain independent executions.

---

# 11. Built-in middleware

The Bun package is expected to provide framework middleware for HTTP-specific concerns such as:

```text
session
CSRF
authentication
authorization checks
rate limiting
```

These middleware classes should be ordinary Bunwire middleware registrations.

For example:

```text
session
    ↓
csrf
    ↓
authenticate
    ↓
authorize
    ↓
controller
```

Ordering must be deterministic.

Middleware groups can provide sensible compositions such as:

```text
web
├── session
└── csrf
```

and other application-specific groups.

Built-in middleware availability should not mean invisible execution. Effective middleware policy should remain understandable.

Duplicate middleware arising through group composition must also have defined normalization/deduplication semantics.

---

# 12. Validation

Bunwire already has a dedicated validation package:

```text
@bunwire/validation
```

It is intentionally framework-independent and already supplies Laravel-style validation concepts including:

```text
ValidationRequest
rules()
messages()
attributes()
validated()
all()
get()
structured validation errors
sync validation
async validation
custom rules
RuleRegistry
rule aliases
nested paths
validated projections
```

It already supports familiar declarations such as:

```ts
rules() {
  return {
    name: ["required", "string"],
    email: ["required", "email"],
    age: ["optional", "integer", "min:18"],
  };
}
```

and pipe syntax such as:

```ts
"required|email"
```

The validation package remains the validation engine. `@bunwire/bun` does not duplicate it.

---

# 13. Form Requests

The Bun package adds the HTTP request layer on top of `@bunwire/validation`.

The intended usage is:

```ts
@Request()
export class CreateUserRequest
  extends FormRequest<CreateUserInput, CreateUserValidated>
{
  rules() {
    return {
      name: ["required", "string"],
      email: ["required", "email"],
    };
  }
}
```

Then:

```ts
@Post("/users")
async store(request: CreateUserRequest) {
  const input = request.validated();
}
```

The responsibilities are deliberately separated:

```text
@Request()
→ canonical Bunwire identity
→ compiler discovery
→ generated registry
→ parameter planning

FormRequest
→ HTTP request facilities
→ request validation lifecycle
→ composes ValidationRequest without duplicating validation behavior

@bunwire/validation
→ validation execution
→ rules
→ errors
→ validated projection
```

The validation package already makes `all()` return the complete original input while `validated()` returns only the successful declared projection. That behavior should remain canonical.

---

# 14. Form Request lifecycle

A registered Form Request supports these lifecycle hooks and APIs:

```text
prepareForValidation()
authorize()
rules()
messages()
attributes()
validated()
```

`prepareForValidation()` may call protected `merge()` while preparation is active. `authorize()` defaults to `true`; Bun runtime invocation always uses `validateAsync()` so synchronous and asynchronous rules compose.

The runtime flow is approximately:

```text
controller invocation plan
        ↓
registered @Request() parameter
        ↓
collect HTTP input
        ↓
construct FormRequest
        ↓
attach current request context
        ↓
prepare input
        ↓
authorize
        ↓
validateAsync()
        ↓
success?
 ┌──────┴──────┐
 yes            no
 ↓               ↓
controller      exception/error response
```

Async validation is already supported by `@bunwire/validation`.

---

# 15. Request input sources

Form Request input has deterministic source semantics.

Potential sources include:

```text
route parameters
query parameters
JSON body
form-urlencoded body
multipart fields
uploaded files
```

The Bun HTTP layer exposes frozen `sources.route`, `sources.query`, `sources.body`, and `sources.files` views. The merged input used by `all()`, `get()`, and validation applies `query < body < route` precedence. Preparation-time `merge()` is the explicit final override.

For example, the framework must decide what happens if:

```text
route id = 1
query id = 2
body id = 3
```

The example therefore resolves `id` to `1`. Repeated query/form keys become frozen arrays in encounter order; single values remain scalar. JSON requires an object root, urlencoded and multipart bodies retain literal keys, and malformed supported bodies produce `400 Bad Request`.

Uploaded `File` objects must also be treated as first-class request values so validation rules can operate on them.

Request parsing uses a clone, leaving the exact native request exposed by `BunHttpContext` untouched. Multipart files remain in the body input and are also filtered into `sources.files`.

---

# 16. Response normalization

Controllers should not all be required to manually construct low-level `Response` objects.

The Bun package needs a central result-normalization system.

`@bunwire/bun` provides one canonical response boundary. Native `Response` values pass through unchanged, `undefined` produces `204 No Content`, and strictly JSON-compatible values produce JSON responses. Redirects use the explicit `redirect()` result helper. Application-defined response resolvers are configured in declaration order through `BunAdapter` HTTP options so later page, file, and streaming result types do not add checks to Controller dispatch.

Controller results may eventually include:

```text
native Response
JSON-compatible value
page response
redirect response
file/download response
streaming response
```

Conceptually:

```text
controller result
      ↓
Response Resolver
      ↓
native Response
```

This prevents individual features from spreading unrelated result-detection logic throughout the runtime.

A native:

```ts
return new Response(...);
```

must always remain valid.

Controller terminal values are normalized before middleware unwinds, allowing after-middleware to observe a native response. A final normalization pass handles middleware short circuits and replacements through the same boundary.

---

# 17. Exception handling

The Bun runtime needs a unified exception pipeline.

The public `BunHttpExceptionHandler` owns `report(error, context)` and `render(error, context)`. Applications may replace it explicitly in `BunAdapter` HTTP options. Reporting failures are observational and cannot replace the request error; renderer failures fall back to an invariant minimal 500.

Examples include:

```text
validation failure
unauthenticated request
authorization failure
CSRF mismatch
not-found condition
HTTP exceptions
application errors
unexpected errors
```

Rather than each subsystem directly inventing a response, exceptions should flow into a framework error handler.

Conceptually:

```text
Error
 ↓
report if appropriate
 ↓
render against current request
 ↓
Response
```

Bun's server-level error handling remains the final runtime boundary, but Bunwire should provide the application-level semantics above it.

The default handler renders known Bun HTTP exceptions deterministically, including 404, 405 with `Allow`, validation 422, unauthenticated 401, authorization 403, and CSRF mismatch 419. Unexpected errors are hidden by default. Only explicit HTTP development mode includes their details; runtime behavior does not depend on `NODE_ENV`.

---

# 18. Sessions

Sessions are a foundational web concern because they enable:

```text
browser authentication
OAuth state
CSRF state
flash messages
validation errors
old form input
server-driven page state
```

The session subsystem has a store contract rather than depending on an ORM. Bun HTTP applications opt in with `http.sessions`; the browser receives only an HMAC-signed opaque ID while state remains server-side. The built-in memory store is intended for development and tests, and custom stores implement the same `read`/`write`/`destroy` boundary.

Conceptually:

```ts
interface SessionStore {
  read(id: string): Promise<...>;
  write(id: string, data: ...): Promise<void>;
  destroy(id: string): Promise<void>;
}
```

Implementations can use:

```text
memory
Redis
filesystem
database through application code
custom services
```

without Bunwire introducing an SQL abstraction.

The request scope exposes a `Session`, `BunCookieJar`, and CSRF context. Session IDs may be regenerated while preserving state, invalidated into a new empty session, or destroyed with an expired response cookie. Flash values survive exactly the following request, and old input uses explicit session APIs. Requests sharing a verified session ID serialize through commit so concurrent mutations are not lost.

Session cookies default to `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`; local plain-HTTP applications must explicitly disable `Secure`. Session values use Bunwire's finite, acyclic serializable-value contract.

---

# 19. CSRF

CSRF protection belongs primarily to the HTTP lifecycle.

The system consists of:

```text
CSRF manager/service
        +
built-in CSRF middleware
```

The middleware handles request verification and lifecycle integration.

The canonical `csrf` alias is contributed through the generic adapter compiler middleware contract and can be attached with Core `@Use()` or middleware policy. `GET`, `HEAD`, and `OPTIONS` are exempt. Unsafe requests accept `X-CSRF-TOKEN` or `_token` from urlencoded/multipart form data, never query parameters. Failures use the central 419 exception path, and session regeneration/invalidation rotates the token.

Bunwire should use suitable Bun-native security primitives rather than implementing unnecessary low-level cryptography itself.

The Bunwire layer owns:

```text
session integration
middleware policy
token lifecycle
request/response integration
form/page helpers
error behavior
configuration
```

---

# 20. Authentication

Authentication is a subsystem, not merely middleware. Milestone 8 implements it with an application-scoped `AuthManager`, request-scoped `BunAuthContext`, and exact named guards.

The architecture should approximately contain:

```text
AuthManager
AuthContext
authentication strategy/guard
session authentication
token/bearer authentication
AuthenticateMiddleware
```

The configured default guard resolves before HTTP middleware. The request context therefore exposes synchronous state:

```ts
context.auth.principal
context.auth.user // alias of principal
context.auth.check()
context.auth.guest()
```

Bunwire should not impose an application `User` model.

The authenticated principal is application-defined.

The authentication system works with arbitrary application user/domain representations. Session guards persist only an application-defined serializable key, resolve a fresh principal for each later request, and regenerate the session on login/logout. Bearer guards parse the native Authorization header. Named guard selection never silently falls through to another guard.

The canonical generated middleware aliases are `auth` and `guest`. Each accepts at most one guard parameter, for example `@Use("auth:bearer")`. Session-backed guards require configured sessions; bearer-only applications do not.

---

# 21. OAuth

OAuth belongs to authentication integration rather than being implemented as a single middleware class.

Conceptually:

```text
OAuth provider
      ↓
external identity
      ↓
application maps identity
      ↓
application principal
      ↓
auth/session
```

Bunwire provides:

```text
provider configuration
redirect flow
callback handling
state management
session integration
authentication integration
```

The application owns initiation/callback routes and external-identity mapping. Bunwire stores up to eight concurrent one-time flows in the server-side session, expires them after ten minutes by default, and always uses state plus S256 PKCE. `createOAuth2Provider()` delegates callback validation and token exchange to `oauth4webapi`; provider presets and OIDC validation remain later work.

Bunwire should not unnecessarily reinvent OAuth/OIDC cryptographic internals.

---

# 22. Authorization

Authorization is also a subsystem rather than only middleware. Milestone 8 uses explicit runtime registration rather than managed policy classes or runtime discovery.

Conceptually:

```text
Authorization service
│
├── abilities/gates
├── policies
└── principal/resource evaluation
```

It can then be consumed from:

```text
middleware
controller decorators
FormRequest.authorize()
services
application code
```

Global abilities and named policies are configured on the Bun HTTP adapter. A named policy may resolve its same-named route parameter into any application resource before evaluation. Both direct request/service calls and generated middleware delegate to one `AuthorizationManager`:

```ts
@Use("can:update,user")
```

`can:ability` checks a global ability; `can:ability,policy` requires the matching `:policy` route parameter. `context.authorization.can()` returns a boolean and `authorize()` throws the canonical 403 exception. Form Request `authorize()` can call the same request-scoped context and still runs before validation.

Authorization must remain independent from any ORM or model framework.

---

# 23. Pages / server-driven frontend

Milestone 9 formalizes this protocol as version 1. `page(component, props)` is resolved through the central Bun response boundary. `X-Bunwire-Page: true` selects JSON navigation responses; initial requests receive a safe HTML shell with JSON escaped inside a non-executable element. Production payloads include the generated asset version, and stale GET navigations receive `409` with `X-Bunwire-Location`. Development omits version enforcement so Vite HMR remains active.

Shared props are async and request-aware. Framework validation/old-input state is merged first, configured resolvers run in declaration order, and Controller props win. Page-aware validation failures with sessions redirect back using `303` and framework-owned one-request state; Form Requests explicitly select safe old-input fields through `flashInput()`.

The navigation/history core is browser-safe at `@bunwire/bun/client`. React is the first renderer through `@bunwire/bun/react`, which provides `createBunwireReactApp()`, `Link`, and `usePage()`. The payload itself remains renderer-neutral; SSR, partial reloads, and deferred props are additive future work.

`@bunwire/bun` should support the server-driven page flow proven in the existing Bun experiment.

The current proof of concept already distinguishes an initial browser request from a client page-navigation request and returns either:

```text
HTML shell
+
serialized initial Page
```

or:

```text
Page JSON
```

respectively.

The intended controller experience is approximately:

```ts
@Get("/")
async index() {
  return page("Home", {
    posts: await this.posts.all(),
  });
}
```

The page protocol should remain framework-agnostic.

A page conceptually contains:

```ts
interface BunwirePage {
  component: string;
  props: Record<string, unknown>;
  url: string;
  version?: string;
}
```

The protocol should leave room for:

```text
shared props
flash data
validation errors
old input
asset/version information
redirects
authentication state
CSRF data
```

without requiring them all in the first implementation.

---

# 24. `@bunwire/vite` integration

The page system naturally integrates with:

```text
@bunwire/vite
```

The expected relationship is:

```text
@bunwire/bun
        ↓
selects page + props

@bunwire/vite
        ↓
resolves/builds frontend page components

frontend
        ↓
React / Vue / Solid / other supported integrations
```

Development can use Bun/Vite development behavior and HMR.

Production can serve the built frontend assets through the Bun application runtime.

The Bun experiment already demonstrates the core server-owned page-selection model.

---

# 25. Shared page props

Applications will need data available on many or all page responses.

Examples:

```text
authenticated user
flash message
validation errors
CSRF token
application information
```

The page system should therefore provide a shared-props mechanism.

Conceptually:

```ts
app.withPages(pages => {
  pages.share(context => ({
    auth: {
      user: context.auth.user,
    },
  }));
});
```

The exact API can change, but shared props should be a first-class design concept.

---

# 26. Events

Events and direct managed listeners are owned by `@bunwire/core`. The Bun package consumes their canonical registry and dispatcher when integrating Bun-specific facilities.

Canonical declaration:

```ts
@Event()
export class UserRegistered {
  constructor(
    public readonly userId: string,
  ) {}
}
```

Events receive canonical compiler identity.

They should not rely on class-name strings.

Optional event aliases remain secondary registry metadata; Core class identity is authoritative for dispatch.

---

# 27. Event listeners

Listeners are managed Bunwire classes.

For example:

```ts
@Listener(UserRegistered)
export class RecordRegistration {
  constructor(
    private readonly audit: AuditService,
  ) {}

  async handle(event: UserRegistered) {
    // ...
  }
}
```

The compiler generates the relationship:

```text
UserRegistered
├── RecordRegistration
├── SendWelcomeNotification
└── UpdateAnalytics
```

There is no need to discover listeners dynamically at runtime.

A runtime `EventEmitter` is not required for compiler-declared direct listeners; Core's `EventDispatcher` consumes the generated relationships.

The initial event semantics should be deterministic.

A strong default is:

```text
listener A
   ↓ await
listener B
   ↓ await
listener C
```

with ordered sequential execution and fail-fast error propagation. Registered events with zero listeners are valid, and nested dispatch is supported by Core.

Bun applications inject `EventDispatcher` from `@bunwire/core` directly into Controllers or Services and await `dispatch(event)`. No Bun wrapper or extra adapter event option is required. Each dispatch gets one root-parented Core invocation and one Provider `boot()` pass, independent of the HTTP request scope. Listeners retain application-singleton defaults; explicit invocation-local listener and dependency bindings in Provider `boot()` enable local state without changing those defaults. Test Providers may replace the application-owned dispatcher with a recording implementation. Bun does not install another dispatcher after Provider registration.

There is no Bun `event` execution-scope kind, automatic HTTP/session-context inheritance, or detached-dispatch shutdown tracking. Carry needed domain data explicitly in the event and await direct work. Queued listener execution remains a later integration.

---

# 28. Queued listeners

A listener may eventually request asynchronous execution.

For example:

```ts
@Listener(UserRegistered)
@Queue("notifications")
export class SendWelcomeNotification {
  async handle(event: UserRegistered) {}
}
```

The precise syntax still needs final design.

Conceptually:

```text
event dispatch
     ↓
listener is synchronous?
 ┌──────┴──────┐
yes            no / queued
 ↓                ↓
invoke          dispatch job-like work
```

Queued listener execution should reuse the queue infrastructure rather than introduce a second unrelated background-work mechanism.

---

# 29. Jobs

Jobs are explicitly executable units of background work.

Example:

```ts
@Job({ id: "billing.generate-invoice" })
export class GenerateInvoice {
  constructor(
    private readonly invoices: InvoiceService,
  ) {}

  async handle(invoiceId: string) {
    // ...
  }
}
```

A job is compiler-discovered and receives its explicit stable decorator ID as canonical queue identity. Its own public non-overloaded `handle()` is an intrinsic managed method, with payload-only parameters and constructor DI. Jobs are transient and execute in separate root-parented `queue-job` scopes. Milestone 11's literal policy compiler rejects inheritance, computed members, and constructor-assigned defaults; no job instance is created during compilation.

Dispatching it should not persist arbitrary class-name strings.

Conceptually:

```text
dispatch
   ↓
canonical job identity
   ↓
serialized payload
   ↓
queue
   ↓
worker
   ↓
generated job registry
   ↓
DI
   ↓
job instance
   ↓
handle(...)
```

---

# 30. Job definition and dispatch configuration

Job defaults may live on the class itself:

```ts
@Job({ id: "billing.generate-invoice" })
export class GenerateInvoice {
  protected queue = "documents";
  protected tries = 5;
  protected timeout = 60_000;
  protected backoff = [1000, 5000, 30000];

  async handle(invoiceId: string) {}
}
```

Dispatch-time configuration can override invocation-specific behavior:

```ts
await queue.job(GenerateInvoice, invoice.id)
  .onQueue("priority")
  .delay(300_000)
  .tries(3)
  .dispatch();
```

This keeps the distinction:

```text
job definition
        +
job dispatch attachment/options
        =
queued execution
```

Inject `QueueManager` with Core `@Inject(BUN_QUEUE_MANAGER)`. Builders are immutable and non-thenable; only `dispatch()` submits. Repeated calls on the same builder share one promise/receipt. Submission snapshots payload and resolved policy. Defaults are queue `default`, tries `1`, no timeout and empty backoff. Delay/backoff/timeout use integer milliseconds (timeout positive); tries is a positive integer. Receipts contain `{ id, job, queue }`, not handler results.

---

# 31. Queue system

The Bun package owns the queue system, introduced incrementally in Milestones 11–12.

That includes:

```text
QueueManager
QueueDriver
job dispatch
queue selection
serialization
delayed jobs
reservation
acknowledgement
release
retry
backoff
timeouts
failed jobs
worker runtime
job execution scopes
```

The developer-facing queue API must not expose which persistence technology powers it.

Possible drivers can include:

```text
sync
memory
Redis
SQLite/database-backed implementation
custom driver
third-party driver
```

Bunwire should not create an SQL abstraction merely to support a database-backed queue.

A driver may directly use the tool it needs.

Milestone 11 requires explicit `BunAdapter({ queues: { driver, serializer? } })` configuration. Without it, the Application may start but dispatch fails clearly. The adapter binds `BUN_QUEUE_MANAGER` before Provider registration and initializes the driver after generated-registry delivery, before HTTP startup. One driver instance belongs to one Application lifecycle.

`SyncQueueDriver` deserializes and awaits one execution through Core invocation, with transient constructor DI and automatic job-scope disposal. It rejects delay/reservation operations, enforces cooperative timeout, and never retries or automatically stores failures. `MemoryQueueDriver` is a process-local, non-durable queue; automatic consumption belongs to the worker-role adapter rather than the driver. Shutdown rejects new submissions, stops HTTP/reservations, waits for accepted attempts, disposes scopes, closes driver/store resources, and removes signal handlers last. Startup rollback closes partially initialized resources.

---

# 32. Queue delivery semantics

Queue delivery semantics must be explicit from the first implementation.

Bunwire should not promise impossible exactly-once execution.

Jobs should be designed around:

> **at-least-once execution**

A job may execute more than once if a worker dies after processing but before acknowledgement.

Applications must therefore treat job idempotency as an important concern.

The queue system must define:

```text
reservation
visibility/reservation timeout
acknowledgement
release
retry attempts
backoff
failed state
delay
```

rather than leaving those behaviors driver-specific.

The driver contract is `initialize`, `push`, `reserve(queue, leaseMilliseconds)`, `acknowledge`, `release(reservation, delayMilliseconds?)`, `fail`, and `close`, with explicit delay/reservation capabilities. Workers additionally require `capabilities.renewal` and `renew(reservation, leaseMilliseconds)`. Memory reservations select available work by availability then insertion order. Each reservation increments attempts and returns a unique lease with reservation/expiry timestamps. Renewal preserves its token/attempts and never shortens expiry. Expired work can be redelivered; stale leases cannot renew, acknowledge, release, or fail it. Release retains attempts. Fail removes reservable work after terminal persistence. Closing memory queues drops remaining work; built-in durable drivers remain deferred.

---

# 33. Job serialization

Persisted jobs require a stable envelope and serialization contract.

Conceptually:

```ts
{
  version: 1,
  id,
  job: canonicalJobId,
  payload,
  serializer: { id: "bun.json", version: 1 },
  policy: { tries, timeout, backoff },
  attempts,
  queue,
  availableAt,
  createdAt,
}
```

The framework must explicitly define how job arguments are serialized.

It should not silently assume every object returned by Prisma or arbitrary application library can be persisted safely.

A serializer contract should exist from the beginning so future serialization formats do not require redesigning the queue API.

`JobSerializer` supplies `id`, positive integer `version`, `serialize(argumentTuple): string`, and `deserialize(payload): readonly unknown[]`. Envelopes snapshot version, canonical ID, payload, serializer identity, policy, attempts (initially zero), queue, and Unix-millisecond times. The default `JsonJobSerializer` rejects undefined entries, sparse arrays, functions/symbols/bigint, accessors, non-enumerable properties, cycles, native/class instances, non-finite numbers, unsafe integers, and negative zero rather than silently losing data. Omitted trailing optional parameters are supported. Runtime execution rejects unknown job IDs and incompatible serializer versions.

---

# 34. Queue workers

Workers run as a dedicated Bun application process.

Conceptually:

```text
bootstrap Bunwire application
        ↓
load generated registries
        ↓
initialize container
        ↓
initialize queue driver
        ↓
reserve job
        ↓
create job scope
        ↓
resolve canonical job
        ↓
execute
        ↓
dispose scope
        ↓
ack / release / persist terminal failure then fail
```

Workers require graceful shutdown behavior and must stop reserving new work before application termination.

Milestone 12 starts a worker automatically after Core reaches running. Configure `queues.worker` with queue names (default `["default"]`), concurrency (`1`), poll interval (`250ms`), and lease duration (`30000ms`). Worker-role Applications require an explicit delay/reservation/renewal-capable driver; other roles remain dispatch-only. The frozen `BUN_JOB_CONTEXT` exposes the envelope, scope and cooperative AbortSignal before Provider boot and constructor DI.

Timeout covers decoding and Core invocation, waits actual settlement before scope disposal, and detects synchronous overruns; it cannot force-kill arbitrary JavaScript. Retry respects attempts/tries and clamps backoff to the last entry. Fatal/invalid failures terminate immediately. Lease renewal continues through disposal and failed-record persistence and is quiesced before settlement. Lost leases prohibit stale settlement and request shutdown. Normal stop finishes active attempts, releases late reservations and closes resources; entrypoints observe `BUN_QUEUE_WORKER.done` and always await `app.stop()` in `finally`.

Bun `@Queue({ id, queue?, tries?, timeout?, backoff? })` supplements canonical Core `@Listener()` in either order. Generic compiler class attachments retain existing event/listener records and validate one shared job/listener ID namespace. Core's generic delivery interceptor enqueues at the ordered encounter, awaits submission, preserves direct dispatch behavior and leaves explicit dispatcher replacements untouched. Configured typed synchronous `QueueEventCodec` instances serialize explicit payloads and reconstruct the exact canonical event class, including private state. The existing v1 envelope carries the listener ID and codec identity/version. Each attempt invokes only the selected generated listener handle with transient DI, no redispatch or inherited caller context.

---

# 35. Failed jobs

The queue architecture should support failed-job tracking and future operational commands such as:

```text
queue:failed
queue:retry
queue:forget
queue:flush
```

The exact CLI syntax can be finalized later, but failure persistence and retry semantics must exist in the architecture from the beginning.

`FailedJobStore` is configured through `queues.failedJobs`, defaulting to non-durable `MemoryFailedJobStore`. It initializes/closes with the Application and saves idempotently by envelope ID before terminal removal, preserving envelope, failure time/reason and safe error details. Save failure leaves external backend work unacknowledged and fails worker shutdown. `QueueManager.listFailed/getFailed/retryFailed/forgetFailed/flushFailed` expose management without a CLI. Retry submits a fresh immediately available ID with attempts reset, retaining the original record until explicitly removed. No distributed transaction or built-in durable store is implied.

---

# 36. Scheduling

Scheduling is split across the existing package boundaries. Core owns the platform-neutral, compile-only `Application.withSchedule()` declaration surface and generated runtime schedule records. Vite analyzes those declarations. `@bunwire/bun` owns scheduled-task identity, cron/timezone interpretation, execution, queue dispatch, locks, and scheduler-host lifecycle.

A scheduled class might look like:

```ts
@Schedule("0 4 * * *")
export class CleanupExpiredSessions {
  constructor(
    private readonly sessions: SessionService,
  ) {}

  async handle() {
    // ...
  }
}
```

`@Schedule()` requires an exported DI-managed class with its own parameterless `handle()` method. The compiler emits its constructor plan, managed `handle()` plan, and immutable schedule record. Each occurrence resolves a fresh task inside an isolated `scheduled-task` execution scope. `BUN_SCHEDULE_CONTEXT` supplies the resolved definition, scheduled/start times, timezone, and current scope through explicit constructor injection.

The runtime consumes only the generated registry; it does not scan decorators or the source tree at startup.

---

# 37. Central scheduling

Applications can schedule existing work centrally in the composition root:

```ts
export default defineApp()
  .withAdapter(new BunAdapter({ role: "scheduler", queues: { driver } }))
  .withSchedule(schedule => {
    schedule.job(GenerateDailyReport, "daily")
      .dailyAt("04:00")
      .timezone("Africa/Lagos")
      .withoutOverlapping()
      .id("reports.daily");
  });
```

Like `withMiddlewares()`, Core type-checks `withSchedule()` but never executes or retains its callback. Vite accepts compiler-safe static JSON job arguments and emits the schedule. This lets an existing `@Job({ id })` be scheduled without an unnecessary wrapper class. `schedule.task(TaskClass)` can also centrally schedule a canonical `@Schedule()` class that has no decorator cadence.

Conceptually:

```text
scheduler
    ↓
dispatch scheduled job
    ↓
queue
    ↓
worker
```

when queued execution is desired.

---

# 38. Scheduler features

The `scheduler` runtime role starts no HTTP server or queue worker. It evaluates the current minute once after Core reaches `running`, then evaluates each new absolute minute once. Missed minutes are skipped rather than replayed. Cron expressions use five fields (minute, hour, day, month, weekday), supporting wildcards, lists, ranges, steps, numeric values, month/weekday names, Sunday as `0` or `7`, and standard day-of-month/day-of-week OR semantics. Seconds and macros are rejected. UTC is the default; the adapter may select another default IANA timezone and individual schedules may override it. A nonexistent local minute during a DST jump does not run; repeated local minutes during a fallback are distinct absolute minutes and may each run.

Cadences include `cron()`, `everyMinute()`, `hourlyAt()`, and `dailyAt()`. User task failures are reported and the loop continues by default; `failurePolicy: "stop"` instead fails scheduler completion and requests Core shutdown. Scheduler infrastructure failures are always fatal.

`withoutOverlapping()` uses a renewable fenced lease for the schedule identity. `onOneServer()` uses a lease for the schedule identity and scheduled minute, requires an explicit stable ID, and is rejected unless the configured `ScheduleLockProvider` declares distributed capability. Combined policies acquire overlap then single-server locks and release them in reverse order. The built-in `MemoryScheduleLockProvider` is process-local and therefore supports overlap prevention only, not a distributed single-server guarantee.

On `app.stop()`, new ticks stop, active scheduled work settles, leases are released, queued work drains, execution scopes dispose, and the lock provider closes. Provider instances belong to one Application lifecycle and are not reusable across Applications. Conditional execution and before/after/success hooks remain future extensions rather than hidden Milestone 13 behavior.

---

# 39. Commands and CLI

Milestone 14 provides managed application commands through the `command` runtime role.

Example:

```ts
@Command({ name: "users:cleanup", description: "Remove inactive users." })
export class CleanupUsers {
  constructor(
    private readonly users: UserService,
  ) {}

  async handle(
    @Argument("team") team: string,
    @Option({ name: "days", alias: "d", type: "integer", default: 30 }) days: number,
    @Flag({ name: "force", alias: "f" }) force: boolean,
  ) {}
}
```

Command classes are compiler-discovered, canonically named, transient, and constructor-DI managed. Their intrinsic `handle()` plan accepts only generated `@Argument`, `@Option`, and `@Flag` resolver parameters; dependencies belong in the constructor. Command names share one namespace with framework commands, whose names are reserved.

Arguments and options support explicit string, finite-number, and safe-integer coercion, required/default values, literal choices, descriptions, and one-character aliases. Flags are false when absent. Parsing accepts long options with a separate or `=` value, short aliases, and `--`; unknown/duplicate options, combined short forms, missing/extra values, and invalid coercion fail as usage errors.

`runBunCli(app, registry)` is the normal entrypoint boundary. It uses `Bun.argv.slice(2)`, starts the Core Application, runs one isolated `command` scope, always awaits `app.stop()`, and returns an exit code for assignment to `process.exitCode`. It never calls `process.exit()`. The frozen `BUN_COMMAND_CONTEXT` exposes parsed values, raw arguments, injectable line-oriented IO, cancellation signal, and scope. `BunCommandRuntime.run()` remains the embedded/test escape hatch.

Success is `0`; a handler may explicitly return any integer through `255`. Usage errors return `2`; startup, execution, or cleanup failures return `1`. Cleanup completes before the runner returns and simultaneous failures remain aggregated and deterministically rendered.

Framework commands are:

```text
serve
routes:list
queue:work
queue:failed
queue:retry
queue:forget
schedule:run
schedule:list
events:list
jobs:list
```

`serve` and `queue:work` are long-running until Core shutdown. The command role accepts their HTTP/worker configuration but starts no feature host until selected. `schedule:run` executes work due in the current minute once without starting the scheduler loop. All listing commands consume the generated registry; no runtime source scanning or constructor-name discovery is used.

---

# 40. WebSockets

WebSockets belong to the Bun runtime and should use Bun's native WebSocket implementation.

Bunwire's responsibility is the managed/decorator-driven application layer.

Conceptually:

```ts
@WebSocket("/chat")
export class ChatSocket {
  open(client) {}

  message(client, message) {}

  close(client) {}
}
```

The exact final handler API needs design, but Bunwire should not create an unrelated WebSocket transport under Bun's implementation.

---

# 41. WebSocket scopes

WebSocket execution requires explicit lifetime semantics.

The application should distinguish:

```text
application scope
       ↓
WebSocket connection scope
       ↓
message execution
```

Connection-specific state must not be stored accidentally in global singleton services.

Authentication during the HTTP upgrade also needs a defined transition:

```text
HTTP request context
      ↓
authenticate / authorize upgrade
      ↓
WebSocket connection context
      ↓
message handlers
```

---

# 42. Rate limiting

Rate limiting belongs naturally in middleware.

The existing middleware-parameter system makes syntax such as:

```ts
@Use("throttle:60,1m")
```

a natural fit.

Rate limiting should use a store abstraction:

```text
memory
Redis
custom
```

rather than being tied to an application database.

This can be implemented after the core HTTP architecture stabilizes without changing the middleware design.

---

# 43. Password hashing

Authentication may need a password-hashing service, but Bunwire should not invent password cryptography.

The default Bun implementation should rely on Bun's native secure password APIs.

Bunwire may expose a DI-friendly service abstraction for developer convenience, while the underlying implementation remains Bun-native.

---

# 44. File uploads

The HTTP request layer needs first-class support for multipart requests and uploaded files.

Form Requests should be able to validate `File` values.

This enables future rules such as:

```text
file
image
MIME/type
maximum size
```

without creating a separate upload framework.

Storage of those files is a different concern and does not need to be solved by the request parser.

---

# 45. Logging and observability

The package does not need to invent a full logging framework.

It does need enough execution metadata that application logging and tracing can understand:

```text
request ID
route
request duration

job ID
job name
attempt
queue

scheduled task
command

WebSocket connection/message
```

Execution contexts should therefore carry useful metadata and lifecycle hooks/events should make observability integrations possible.

---

# 46. Testing

Framework systems should be designed to be replaceable in tests.

Examples include:

```text
real queue
fake queue

real event dispatcher
fake event dispatcher

real scheduler
test scheduler
```

The exact testing API can come later, but architecture should avoid hidden global state that makes faking these systems difficult.

HTTP testing helpers should eventually make controller/middleware/Form Request behavior straightforward to test using Bun's runtime facilities.

---

# 47. What should use Bun directly

Bunwire should favor native Bun facilities wherever they already solve the low-level problem well.

Examples include:

```text
HTTP
→ Bun.serve()

WebSockets
→ Bun native WebSockets

cookies
→ Bun/Web Request cookie facilities

password hashing
→ Bun password APIs

CSRF low-level primitive
→ Bun-native facility where suitable

Redis integration
→ Bun Redis capability where suitable

SQLite/database-backed internals
→ direct runtime/library use where suitable

background/process execution
→ Bun worker/process primitives where suitable
```

The purpose of Bunwire is not to obscure Bun.

The purpose is to organize Bun applications.

---

# 48. What Bunwire contributes

The package's value comes primarily from:

```text
canonical decorators
compiler discovery
generated registries
compile-time validation
managed classes
dependency injection
execution scopes
middleware composition
request lifecycle
application conventions
runtime lifecycle
consistent errors
consistent response handling
feature integration
Laravel-like ergonomics
```

The framework should therefore prefer:

```text
Bun-native primitive
+
Bunwire application abstraction
```

over:

```text
Bunwire reimplementation of Bun primitive
```

---

# 49. Current ownership

For the first implementation phase, the ownership is deliberately simple.

```text
@bunwire/core
├── Application and lifecycle orchestration
├── compiler and generated registry machinery
├── managed class/method and invocation system
├── DI/container and generic invocation scopes
├── adapter/class-kind extension APIs
├── middleware foundations
└── canonical events, listeners, and direct EventDispatcher
```

```text
@bunwire/validation
├── validation engine
├── ValidationRequest
├── rules
├── RuleRegistry
├── validation errors
├── sync/async validation
└── validated projection
```

```text
@bunwire/vite
├── existing Vite/build integration
└── frontend page component resolution and assets
```

```text
@bunwire/bun
├── BunAdapter and runtime-role integration
├── Bun resource startup/graceful-shutdown participation
├── Bun-specific execution-scope kinds and contextual values
│
├── HTTP
│   ├── Bun.serve integration
│   ├── controllers
│   ├── routing
│   ├── request context
│   ├── middleware
│   ├── @Request()
│   ├── FormRequest
│   ├── response normalization
│   ├── exception handling
│   └── uploads
│
├── web application services
│   ├── sessions
│   ├── CSRF
│   ├── authentication
│   ├── OAuth integration
│   ├── authorization
│   └── rate limiting
│
├── pages
│   ├── page responses
│   ├── shared props
│   ├── validation/flash integration
│   └── @bunwire/vite bridge
│
├── Core event integration
│   └── optional queued-listener integration
│
├── jobs
│   ├── queue manager
│   ├── queue drivers
│   ├── serialization
│   ├── retries/backoff
│   ├── failed jobs
│   └── workers
│
├── scheduling
│   ├── scheduled tasks
│   ├── central schedule configuration
│   └── locking abstraction
│
├── commands / CLI
│
└── WebSockets
    ├── managed handlers
    ├── connection scope
    └── message execution
```

---

# 50. Long-term extraction

Nothing in this architecture assumes all these concepts must remain Bun-specific forever.

After the remaining Bun-owned systems have been implemented and proven, Bunwire can evaluate concepts such as:

```text
job identity
scheduled-task metadata
Bun-specific execution-scope kinds
queue and scheduling contracts
```

for extraction into Core.

The criterion should be:

```text
Is this concept genuinely runtime-independent?
```

If yes:

```text
move abstraction/compiler concept toward Core
```

If no:

```text
leave it in @bunwire/bun
```

Runtime-specific implementations should continue living with their runtime.

For example:

```text
generic scheduler metadata
→ potentially Core later

Bun scheduler runtime
→ @bunwire/bun
```

The initial implementation deliberately avoids making that abstraction decision prematurely.

---

# 51. Overall developer experience

A mature Bunwire Bun application should eventually be configured in a bootstrap file approximately like this:

```ts
import { defineApp } from "@bunwire/core";
import { BunAdapter } from "@bunwire/bun";

const app = defineApp()
  .withAdapter(new BunAdapter({
    role: "http",
  }));

app.withMiddlewares(registry => {
  registry.use("session");

  registry.group("web", [
    "csrf",
  ]);

  registry.group("authenticated", [
    "auth",
  ]);
});

app.withSchedule(schedule => {
  schedule
    .job(GenerateDailyReport)
    .dailyAt("04:00");
});

export default app;
```

The host entrypoint starts that configured Core Application:

```ts
import registry from "virtual:bunwire/registry";
import app from "./bootstrap";

await app
  .withRuntimeRegistry(registry)
  .start();
```

Controller:

```ts
@Controller("/users")
export class UsersController {
  constructor(
    private readonly users: UserService,
  ) {}

  @Get("/:id")
  async show(context: BunRequestContext) {
    return this.users.find(context.route.params.id);
  }

  @Post("/")
  async store(request: CreateUserRequest) {
    return this.users.create(
      request.validated(),
    );
  }
}
```

Form Request:

```ts
@Request()
export class CreateUserRequest
  extends FormRequest<CreateUserInput, CreateUserValidated>
{
  rules() {
    return {
      name: ["required", "string"],
      email: ["required", "email"],
    };
  }
}
```

Event:

```ts
@Event()
export class UserRegistered {
  constructor(
    public readonly userId: string,
  ) {}
}
```

Listener:

```ts
@Listener(UserRegistered)
export class RecordRegistration {
  async handle(event: UserRegistered) {
    // ...
  }
}
```

Job:

```ts
@Job({ id: "notifications.send-welcome-email" })
export class SendWelcomeEmail {
  protected queue = "emails";
  protected tries = 3;

  async handle(userId: string) {
    // ...
  }
}
```

Scheduled task:

```ts
@Schedule("0 3 * * *")
export class CleanupExpiredSessions {
  async handle() {
    // ...
  }
}
```

Command:

```ts
@Command("users:cleanup")
export class CleanupUsersCommand {
  async handle() {
    // ...
  }
}
```

WebSocket:

```ts
@WebSocket("/chat")
export class ChatSocket {
  open(client) {}

  message(client, message) {}

  close(client) {}
}
```

Page response:

```ts
@Get("/dashboard")
async dashboard() {
  return page("Dashboard", {
    // ...
  });
}
```

The compiler understands all of these declarations, validates their relationships, and produces the Bun application registry consumed by the runtime.

---

# 52. Central design principle

The entire package can ultimately be summarized by one principle:

> **`@bunwire/bun` is the Bun-native application runtime for Bunwire. Bun provides the runtime primitives; Bunwire provides the application architecture.**

It should feel Laravel-like where Laravel provides useful application ergonomics, but it should not reproduce Laravel's internals simply for similarity.

Bunwire should use its own strengths:

```text
TypeScript
Bun
static compilation
canonical symbols
generated registries
managed classes
dependency injection
execution scopes
native Web APIs
Bun-native runtime capabilities
```

The result should be a cohesive full application framework rather than a collection of unrelated decorators.

Core now owns event identity, aliases, direct listener identity/invocation, the generated event registry, and `EventDispatcher`. Bun retains jobs, queues, scheduling, and optional queued-listener integration. Queued listeners must consume the Core definitions rather than replace them.
