# `@bunwire/bun` Implementation Milestones

## Purpose

This file defines the complete implementation plan for `@bunwire/bun`, Bunwire's first-party Bun application runtime.

The package is intended to provide a cohesive Bun-native application framework around:

- `Bun.serve()`
- managed HTTP controllers and routing
- Bunwire middleware
- registered `@Request()` / Form Request validation
- response normalization and exception handling
- sessions and CSRF
- authentication, OAuth integration, and authorization
- server-driven pages with `@bunwire/vite`
- integration with Core events and listeners
- jobs, queues, workers, retries, and failed jobs
- scheduled tasks and scheduler runtime
- commands and CLI execution
- Bun-native WebSockets
- Bun-specific runtime scopes, Core lifecycle integration, graceful shutdown, and testability

For the initial implementation, Bun-specific runtime systems remain inside `@bunwire/bun`, even when some may later prove generic enough to extract into `@bunwire/core`. Core's existing Application lifecycle, compiler/registry machinery, container and invocation infrastructure, middleware foundations, and direct event/listener system remain canonical and must be consumed rather than duplicated.

The implementation must preserve Bunwire's established architectural rules:

- canonical decorator-symbol identity
- compiler-driven discovery
- generated registries and invocation plans
- no startup decorator scanning
- no class-name-string identity
- no hard-coded adapter concepts in Core
- managed classes resolved through Bunwire DI
- deterministic compiler diagnostics
- runtime execution from compiled metadata
- native Bun primitives used where appropriate rather than reimplemented

---

# Planning and Progress Rules

The implementation should use:

```text
packages/bun/
├── MILESTONES.md
├── progress.md
└── progress/
    ├── milestone-01.md
    ├── milestone-02.md
    ├── ...
    └── milestone-16.md
```

`progress.md` is the high-level package status:

- completed milestones
- current milestone
- next milestone
- links to milestone-specific progress files
- major unresolved blockers only

Each `progress/milestone-XX.md` records:

- implementation summary
- files added/changed
- architectural decisions made
- diagnostics added
- automated tests added
- behavioral/manual verification performed
- deviations from the milestone specification
- known follow-up work
- final completion status

A milestone is not complete merely because its public API exists. It is complete only when its compiler, runtime, diagnostics, tests, documentation, and generated-registry behavior required by that milestone are implemented.

---

# Global Constraints

These apply to every milestone.

## Compiler and registry rules

All Bunwire-managed concepts introduced by this package must use canonical compiler identities.

The implementation must not use:

- runtime directory globbing to discover decorated classes
- `Reflect` metadata scanning as the primary application discovery mechanism
- class names as canonical identities
- decorator IDs without canonical symbol authorization
- inheritance alone to identify Bunwire-managed classes
- runtime guessing of controller/request/job/listener types

Generated metadata must reference canonical definitions understood by Bunwire's compiler/runtime infrastructure.

## Runtime rules

Runtime code must consume compiled registries and plans.

It must not repeat source-analysis work already performed by the compiler.

Runtime errors should be reserved for genuinely runtime-dependent failures. Invalid static application structure should fail compilation.

## Package boundary

For this implementation:

```text
@bunwire/core
    Application and lifecycle orchestration
    compiler and generated registry machinery
    container, DI, and invocation infrastructure
    middleware foundations
    canonical events/listeners and direct EventDispatcher

@bunwire/validation
    validation engine

@bunwire/vite
    existing Vite/build integration used where needed

@bunwire/bun
    BunAdapter and Bun-specific runtime roles
    Bun-specific execution-scope kinds and contextual values
    HTTP, web, pages, jobs/queues, scheduling, commands, and WebSockets
    optional queued-listener integration using Core event identities
```

Core already owns canonical event identity, aliases, direct managed listeners, generated relationships, and `EventDispatcher`. Do not duplicate them in Bun. Jobs, queues, schedules, execution scopes, and queued-listener integration remain Bun responsibilities unless separately moved by an authoritative Core milestone.

## Explicit non-goals

This plan does not include:

- ORM
- query builder
- SQL abstraction
- migration framework
- model framework
- Eloquent-style route model binding
- automatic Prisma/Drizzle entity binding
- Bunwire-owned database schema layer

Applications remain free to use Prisma, Drizzle, Kysely, Bun SQL, Redis, SQLite, repositories, external APIs, or any other persistence layer directly through DI/services.

---

# Milestone 1 — Package Foundation, Bun Adapter, and Runtime Roles

## Goal

Create the `@bunwire/bun` package foundation and attach Bun's host/runtime integration to the existing Core Application without implementing feature subsystems prematurely.

## Scope

Implement the package entry points, class-based `BunAdapter`, configuration surface, Core lifecycle integration, generated-registry consumer, and runtime-role model.

The same configured Core Application must be capable of starting through `BunAdapter` as different process roles without every role starting the HTTP server.

Initial runtime roles:

```text
http
worker
scheduler
command
```

## Requirements

- Create the package with proper workspace/build/test configuration.
- Integrate with existing Bunwire Core application/container/compiler extension APIs.
- Implement `BunAdapter` using Core's class-based primary-host adapter model.
- Define `BunAdapter` configuration and runtime-role selection.
- Attach `BunAdapter` to the same Core Application returned by `defineApp()`.
- Consume the generated runtime registry through Core's existing `withRuntimeRegistry(...)` startup path.
- Ensure HTTP-specific startup is not executed for worker/scheduler/command roles.
- Integrate Bun host preparation, runtime startup, and resource cleanup with Core's Application/adapter lifecycle.
- Use internal lifecycle notifications only where necessary; they must not replace or redefine Core's public event/listener system.
- Preserve Core's deterministic lifecycle transitions and duplicate-`start()` rejection.
- Ensure startup failure safely cleans up Bun resources initialized during the failed attempt.
- Establish a Core-owned generic shutdown/disposal boundary if Bun's graceful resource cleanup requires lifecycle support not yet exposed by Core; do not introduce a separate Bun application state machine.
- Define package-level extension/registration entry points needed by later milestones.
- Establish generated-registry consumption without adding concrete Bun class kinds yet.
- Add a minimal example application used by later integration tests.

## Tests

### Automated

- `defineApp()` returns the Core Application configured with `BunAdapter`
- `BunAdapter` attaches as the primary host adapter
- `app.withRuntimeRegistry(registry).start()` starts once
- duplicate `start()` is rejected by Core
- Core-owned shutdown/disposal cleans up Bun resources
- shutdown/disposal is idempotent where intended
- startup failure disposes initialized Bun resources
- HTTP role starts only HTTP-owned resources
- worker role does not start HTTP
- scheduler role does not start HTTP
- command role does not start HTTP
- Core Application and Bun adapter lifecycle ordering is deterministic

### Behavioral

- configure a minimal Core Application with `BunAdapter`, load its generated registry, start it, and exercise graceful cleanup
- verify process termination does not leave hanging resources

## Acceptance Criteria

- `@bunwire/bun` can attach to and start through the Core Application with no feature-specific lifecycle hacks.
- Runtime roles are explicit.
- Later subsystems integrate with the one Core-owned lifecycle.
- No source scanning occurs during application startup.

---

# Milestone 2 — Execution Scopes and Contextual Resolution

## Goal

Introduce the execution-scope foundation required to prevent request/job/command/schedule/WebSocket state from leaking through the application container.

## Scope

Implement Bun-owned execution scopes using existing Core/container extension points.

Initial scope kinds:

```text
application
http-request
queue-job
command
scheduled-task
websocket-connection
websocket-message
```

## Requirements

- Define Bun execution-scope descriptors/identities.
- Implement child-scope creation from the application container.
- Implement scoped service resolution.
- Ensure scope disposal occurs reliably.
- Ensure scope-local values are inaccessible outside their scope.
- Support contextual runtime values such as:
  - current HTTP context
  - current queue job metadata
  - current command metadata
  - current scheduled task metadata
  - current WebSocket connection/message metadata
- Support nested WebSocket message scope under connection scope.
- Prevent accidental reuse of disposed scopes.
- Define behavior when scope disposal throws.
- Integrate graceful shutdown with active scopes.
- Avoid AsyncLocalStorage/global-context magic unless explicitly needed; the canonical mechanism should remain Bunwire scope resolution.

## Tests

### Automated

- scoped instances are reused within one scope
- separate scopes receive separate scoped instances
- application singletons remain shared
- disposing one scope does not dispose application singletons
- disposed scoped services cannot be reused
- nested connection/message scopes resolve correct parents
- job/command/request contextual values do not leak
- disposal executes in deterministic order

### Behavioral

- concurrent HTTP-like scopes do not share state
- concurrent job-like scopes do not share state

## Acceptance Criteria

- Every later runtime subsystem can execute inside a dedicated Bunwire scope.
- No subsystem needs global mutable "current request/job" state.

---

# Milestone 3 — Compiler Extension: Bun HTTP Controllers and Native Routing

## Goal

Introduce Bun HTTP controllers/routes as canonical compiler concepts and translate compiled routing information into `Bun.serve()`.

## Scope

Implement Bun controller/route decorators and compiler integration required for Bun-native HTTP dispatch.

## Requirements

- Register canonical Bun controller class kind/descriptor using Core extension APIs.
- Implement canonical HTTP method decorators required for the initial release:
  - `@Get`
  - `@Post`
  - `@Put`
  - `@Patch`
  - `@Delete`
  - `@Options`
  - `@Head`
- Support controller path prefix plus method route path.
- Authorize decorator factories by resolved TypeScript symbol identity.
- Detect duplicate/conflicting routes at compile time where statically knowable.
- Validate illegal route definitions.
- Emit canonical generated route metadata.
- Use Bun's native routing facilities as directly as practical.
- Do not create an Express-like secondary router.
- Create an HTTP request scope for every Bunwire-managed request.
- Resolve controllers through Bunwire DI.
- Invoke controller methods through compiled managed-method plans.
- Preserve access to native Bun/Web `Request` and native `Response`.
- Implement deterministic 404 and method-not-allowed behavior through the framework exception/response path once available; temporary minimal responses are acceptable until Milestone 5.

## Tests

### Compiler/Automated

- canonical controller decorators are recognized
- fake decorator with matching text/ID is rejected
- routes compile to generated registry metadata
- duplicate static routes fail
- unsupported method metadata fails
- controller dependencies resolve through DI
- controller invocation uses compiled plans

### Behavioral

- start real `Bun.serve()`
- GET route returns response
- POST route returns response
- route params are available
- concurrent requests receive separate request scopes
- unknown route produces deterministic fallback behavior

## Acceptance Criteria

- A Bunwire application can serve managed controllers using `Bun.serve()`.
- Runtime dispatch is based on generated route metadata.
- No runtime source/controller discovery exists.

---

# Milestone 4 — Bun HTTP Context and Middleware Runtime

## Goal

Implement the Bun HTTP middleware context and connect the already-defined Bunwire middleware system to `Bun.serve()`.

## Scope

Use the established middleware contract without redesigning its public semantics.

## Requirements

- Define `BunMiddlewareContext`.
- Include appropriate runtime information:
  - native `Request`
  - route/path
  - HTTP method/transport
  - route params
  - Bun server reference where appropriate
  - middleware attachment parameters
  - access to request execution scope
- Implement adapter-specific:
  - `include`
  - `exclude`
  - `only`
  - `except`
- Interpret `include`/`exclude` as Bun HTTP path filtering.
- Interpret `only`/`except` as HTTP method/transport filtering.
- Support middleware aliases.
- Support `@Use(...)`.
- Support Laravel-style parameters:
  - `auth:admin`
  - `throttle:60,1m`
- Support `app.withMiddlewares(...)`.
- Support:
  - `registry.use(...)`
  - middleware groups
  - nested groups
  - controller mappings
- Detect:
  - duplicate aliases
  - alias/group name ambiguity
  - group cycles
  - unresolved middleware references
- Preserve declared ordering.
- Establish deterministic effective ordering:
  - global
  - centralized controller mapping
  - controller `@Use`
  - method `@Use`
- Define middleware deduplication rules.
- A canonical middleware attachment should not execute twice merely because two groups expand to the same attachment, unless the attachment is intentionally parameter-distinct and the specification permits multiple invocation.
- Built-in Bun middleware added in later milestones must use this same runtime.

## Tests

### Compiler/Automated

- alias resolution
- group expansion
- nested group expansion
- parameter parsing
- group-cycle rejection
- ambiguous name rejection
- controller mapping resolution
- canonical `@Use` symbol authorization
- deterministic ordering
- deduplication semantics

### Behavioral

- before/after middleware execution
- short-circuiting
- HTTP method filtering
- path filtering
- parameterized middleware
- DI inside middleware
- multiple request scopes remain isolated

## Acceptance Criteria

- Bun middleware has feature parity with the middleware system already designed.
- No separate private middleware mechanism is created for Bun built-ins.

---

# Milestone 5 — Response Resolution and Exception Pipeline

## Goal

Create the centralized HTTP result and failure pipeline on which Form Requests, auth, pages, CSRF, files, and later web features can rely.

## Scope

Implement response normalization, framework HTTP exceptions, exception reporting/rendering, and fallback behavior.

## Requirements

### Response Resolution

Support at minimum:

- native `Response`
- JSON-compatible controller return values
- `undefined`/void semantics
- explicit redirect response abstraction/helper
- extensible response-resolver mechanism for later page/file/stream responses

Do not scatter result-type checks through controller dispatch.

All controller results must pass through one response-resolution boundary.

### Exceptions

Define framework errors required by later milestones, including appropriate equivalents of:

- HTTP exception/status error
- not found
- method not allowed
- validation failure integration point
- unauthenticated
- authorization denied
- CSRF mismatch

Implement a central exception handler with conceptual responsibilities:

```text
report(error, context)
render(error, context) -> Response
```

Requirements:

- framework-known errors render deterministic status/responses
- unexpected errors reach one common handler
- error reporting must not recursively crash rendering
- Bun's native `Bun.serve()` error boundary is the final safety net, not the primary framework behavior
- middleware unwind/finally behavior remains correct on exceptions
- production/development exposure rules are explicit
- exception pipeline is replaceable/extensible by applications later

## Tests

### Automated

- native Response passes through
- plain object becomes JSON
- redirect resolves correctly
- unsupported return value behavior is deterministic
- known HTTP exceptions render expected status
- unknown errors render safe 500
- development error output differs only where explicitly intended
- middleware `finally` executes during exceptions
- custom exception renderer can override default handling

### Behavioral

- real HTTP request producing controller error receives framework response
- error does not terminate server process

## Acceptance Criteria

- All later HTTP systems have one canonical success/failure output path.
- No feature needs to directly own global HTTP error rendering.

---

# Milestone 6 — `@Request()` and Form Request Integration

## Goal

Integrate the existing `@bunwire/validation` package with Bun HTTP controller invocation through canonical registered `@Request()` classes.

## Scope

Implement `@Request()`, `FormRequest`, request compiler registry entries, input aggregation, authorization hook integration point, validation, and controller injection.

## Requirements

### Canonical Request Identity

- Implement canonical `@Request()` decorator.
- Register request class kind/descriptor.
- `@Request()` is mandatory.
- Extending `FormRequest` alone must never register or discover a request.
- Validate required request contract/base class.
- Emit registered request metadata into generated Bun registry.
- Controller parameter plans must reference canonical request identities.

### FormRequest

`FormRequest` should build on `@bunwire/validation`'s `ValidationRequest` rather than reimplement validation.

Preserve:

- `rules()`
- `messages()`
- `attributes()`
- `all()`
- `get()`
- `errors`
- `validated()`
- sync/async validator capabilities

Bun-managed HTTP invocation should normally use async validation so mixed sync/async rules work.

### HTTP Input

Define and document explicit source behavior for:

- route params
- query
- JSON body
- urlencoded form body
- multipart fields
- uploaded `File` values

Expose source-specific access separately.

Define deterministic merged-validation-input precedence.

Do not leave key collisions accidental.

### Lifecycle

Support Bun-specific lifecycle around the validation engine, including:

- context binding
- preparation hook
- authorization hook
- validation
- controller injection

A failed request must never invoke the controller.

### DI

Registered Request classes may use Bunwire DI.

Runtime request context/input is contextual data supplied by the request scope rather than a global singleton.

## Tests

### Compiler/Automated

- `@Request()` class enters generated registry
- subclass without `@Request()` is not treated as managed request
- fake/noncanonical `@Request` decorator is rejected
- controller request parameter compiles to request resolution plan
- invalid request classes fail compilation
- request constructor dependencies are planned through DI

### Validation/Automated

- JSON body validation
- query validation
- route input behavior
- form body validation
- multipart fields
- files survive input aggregation
- input precedence is deterministic
- async rules work
- custom messages/attributes work
- `validated()` returns only declared projection
- failed validation prevents controller invocation

### Behavioral

- valid HTTP request injects a ready FormRequest
- invalid request returns framework validation response
- request scopes remain isolated under concurrency

## Acceptance Criteria

- Bunwire has Laravel-style registered Form Requests without duplicating `@bunwire/validation`.
- The compiler, not runtime inheritance scanning, decides what a managed request is.

---

# Milestone 7 — Sessions, Cookies, Flash State, and CSRF

## Goal

Provide the stateful web foundation needed by browser authentication, OAuth, CSRF, flash messages, and server-driven pages.

## Scope

Implement session contracts/stores, request session lifecycle, cookie integration, flash/old-input facilities, and CSRF protection.

## Requirements

### Sessions

Define:

- `Session`
- `SessionManager`
- `SessionStore`

Support a safe first-party development/test store such as in-memory storage.

The store contract must permit future Redis/database/custom stores without an ORM abstraction.

Session lifecycle:

```text
incoming cookie/session id
        ↓
load session
        ↓
attach to request scope
        ↓
middleware/controller/request use
        ↓
commit/rotate/destroy
        ↓
response cookie
```

Support:

- get
- put/set
- remove
- clear
- regenerate ID
- invalidate/destroy
- flash
- consume flash
- old input where needed

### Cookies

Use Bun/Web cookie facilities where practical.

Provide Bunwire ergonomics only where framework integration requires them.

### CSRF

Implement:

- CSRF manager/service
- built-in `csrf` middleware alias
- safe-method exemption semantics
- token generation
- token verification
- session/cookie integration as chosen
- token rotation semantics
- failure through the central exception pipeline
- page/form access to token where required

Use Bun-native security/CSRF primitives when appropriate rather than inventing low-level crypto.

## Tests

### Automated

- session load/commit
- missing/new session
- regeneration
- destroy
- flash survives exactly intended number of requests
- old input behavior
- concurrent sessions remain isolated
- CSRF valid token passes
- invalid/missing token fails
- safe HTTP methods skip verification
- session middleware ordering with CSRF is deterministic

### Behavioral

- browser-like request receives session cookie
- subsequent request restores session
- CSRF-protected POST succeeds/fails correctly

## Acceptance Criteria

- Stateful web applications have a coherent session/CSRF foundation.
- No ORM or SQL layer is introduced.

---

# Milestone 8 — Authentication, OAuth Integration, and Authorization

## Goal

Implement a cohesive identity/security layer built on the request/session/middleware foundations.

## Scope

Authentication context/manager, authentication strategies/guards, built-in auth middleware, OAuth integration contracts/flow, authorization abilities/policies, and Form Request authorization integration.

## Requirements

### Authentication

Define generic application-controlled principal typing.

Do not define a Bunwire User model.

Provide conceptual capabilities:

- current principal
- `check()`
- `guest()`
- authenticate current request
- login/session establishment
- logout
- session-based auth
- bearer/token strategy extension point

Implement built-in authentication middleware using the normal middleware system.

Parameterized auth middleware may select a strategy/guard where supported.

### OAuth

Implement framework integration, not a home-grown OAuth cryptographic stack.

Provide architecture for:

- provider registration/configuration
- redirect initiation
- state handling
- callback handling
- external identity result
- application-controlled mapping from external identity to application principal
- session/auth integration

Protocol/security-sensitive internals should use suitable existing libraries/runtime primitives.

### Authorization

Define:

- authorization service/manager
- abilities/gates
- policy registration/lookup if policies are included
- principal + resource evaluation
- built-in `can`/authorization middleware
- direct service use outside middleware
- Form Request `authorize()` integration

Authorization must not depend on ORM models.

### Compiler

If policy/authorization classes are managed Bunwire concepts, give them canonical decorator identities and generated-registry relationships rather than runtime scans.

## Tests

### Automated

- anonymous/authenticated request context
- login/logout/session restoration
- auth middleware allow/deny
- multiple auth strategies are deterministic
- OAuth state is created/validated
- callback error handling
- external identity mapping hook
- ability allow/deny
- policy resolution
- FormRequest authorization happens before validation/controller execution as specified
- authorization failure uses exception pipeline

### Behavioral

- complete session-authenticated request flow
- OAuth provider flow can be tested with a fake provider/client
- policy-protected route succeeds/fails as expected

## Acceptance Criteria

- Authentication and authorization are reusable subsystems, not logic buried inside middleware.
- OAuth feeds into authentication rather than existing as an unrelated mechanism.
- No Bunwire model/ORM assumptions exist.

---

# Milestone 9 — Server-Driven Pages and `@bunwire/vite` Bridge

## Goal

Turn the existing Inertia-style experiment into a formal Bunwire server-driven page protocol integrated with Bunwire HTTP, validation/session state, and Vite.

## Scope

Page responses, initial HTML shell, navigation payloads, shared props, flash/validation props, redirects/versioning hooks, and Vite page resolution/build integration.

## Requirements

### Page Protocol

Define a versionable page payload containing at least:

- component
- props
- URL
- optional asset/version identifier

Define headers/protocol markers for:

- page navigation request
- page response
- redirect/navigation behavior
- asset version mismatch if implemented now

### Initial Request

Return:

```text
HTML application shell
+
serialized initial page payload
```

Serialization must safely prevent script/HTML injection.

### Navigation Request

Return page JSON rather than the full shell.

### Controller API

Provide an ergonomic helper/result such as:

```ts
return page("Dashboard", { ...props });
```

Integrate through the central response resolver.

### Shared Props

Support application-wide/shared props.

Allow request-aware props such as:

- authenticated principal
- flash messages
- validation errors
- CSRF token

Support lazy/deferred evaluation if part of the chosen design, otherwise leave an explicit extension point.

### Vite

Integrate with existing `@bunwire/vite` rather than duplicating Vite behavior.

Support development and production asset/page resolution.

## Tests

### Automated

- page result resolves through response resolver
- initial request returns HTML shell
- navigation request returns JSON page payload
- payload escaping is safe
- shared props merge deterministically
- flash/validation props appear where expected
- missing page/component behavior is deterministic
- production asset/version integration works
- development integration does not require production build

### Behavioral

- browser initial page load
- client-side page navigation
- validation error round-trip
- authenticated shared prop
- Vite development HMR remains functional

## Acceptance Criteria

- Bunwire has a first-class server-driven page system based on the proven experiment.
- The protocol is formal enough to evolve without replacing the controller API.

---

# Milestone 10 — Events and Managed Listeners

## Goal

Integrate Bun applications with the compiler-discovered event/listener system provided by `@bunwire/core`.

## Scope

Consume Core's canonical `@Event()`, `@Listener(Event)`, generated registry, DI-managed direct invocation, deterministic dispatcher, and testing replacement surface without redefining them.

## Requirements

### Events

- reuse Core's canonical `@Event()` decorator
- consume Core's generated event registry identity and alias index
- no class-name string identity
- add no Bun-specific event declaration or validation path

### Listeners

- reuse Core's canonical `@Listener(Event)` decorator
- listener classes resolved through DI
- consume Core compiler validation of canonical/registered event targets
- consume Core's generated event → listeners relationships
- preserve Core's deterministic listener ordering

### Dispatch

Initial semantics should be explicit.

Default:

```text
listener A
  ↓ await
listener B
  ↓ await
listener C
```

Sequential execution preserves declared/generated order.

Default failure semantics:

- listener failure rejects dispatch
- later listeners do not run unless the public contract explicitly chooses otherwise

Add alternative behavior only if deliberately specified.

### Runtime

Direct dispatch is Core behavior and consumes generated registry metadata. Bun integrations delegate to that dispatcher unless a listener is explicitly handled by future queue policy.

Do not require a dynamic EventEmitter registry for compiler-known listeners.

### Testing

Use Core's replaceable application-owned dispatcher surface so event dispatch can be faked/recorded in tests without global monkey-patching.

## Tests

### Compiler/Integration

- Bun compilation consumes Core's canonical event/listener recognition
- Core still rejects fake decorators and unregistered listener targets in a Bun application
- Bun's generated registry preserves Core event-listener relationships and constructor DI plans
- Bun adds no parallel event/listener definitions or compiler diagnostics

### Runtime/Automated

- event invokes listener
- multiple listeners execute sequentially
- failure propagation
- listener scoped dependencies
- nested event dispatch
- no listeners is valid
- concurrent dispatches do not share execution-local state

## Acceptance Criteria

- Core Events/listeners remain fully compiler-backed and DI-managed when used from Bun.
- Bun defines no parallel event identity or direct dispatcher.
- No runtime discovery exists.

---

# Milestone 11 — Jobs, Queue Contracts, Serialization, and Dispatch

## Goal

Implement canonical managed jobs and the queue contract/payload model before adding long-running workers.

## Scope

`@Job()`, generated job registry, queue manager/driver API, job definition defaults, dispatch options, serialization, delayed availability, and sync/memory drivers.

## Requirements

### Jobs

- canonical `@Job()` decorator
- job class registry
- canonical stable job identity in queue payloads
- DI-managed job instances
- explicit `handle(...)` contract or managed invocation definition
- class-level defaults such as:
  - queue
  - tries
  - timeout
  - backoff

### Dispatch

Provide ergonomic dispatch.

Support invocation-specific options such as:

- queue name
- delay
- retry override where appropriate

Preserve distinction between job definition and dispatch attachment.

### Queue Contract

Define queue-driver semantics for:

- push
- reserve/pop
- acknowledge
- release
- fail
- delayed availability
- reservation metadata

Define driver capability expectations clearly.

### Delivery

Document and enforce:

```text
at-least-once execution
```

Do not promise exactly-once delivery.

### Serialization

Define versionable queue envelope, including at least:

- unique queued-job ID
- canonical job identity
- serialized arguments/payload
- queue
- attempts
- available time
- created time
- metadata/version

Define `JobSerializer` contract.

Default serializer behavior must be explicit and reject unsupported payloads rather than corrupt them silently.

### Initial Drivers

Provide:

- synchronous driver for testing/simple execution
- in-memory queue driver for worker tests/development

Do not build an ORM.

## Tests

### Compiler/Automated

- canonical job registration
- fake decorator rejection
- generated job identity
- job constructor DI planning
- invalid job definition diagnostics

### Queue/Automated

- dispatch creates canonical envelope
- definition defaults applied
- dispatch overrides applied
- delayed availability
- serialization round-trip
- unsupported serialization fails clearly
- sync driver executes
- memory driver push/reserve/ack
- release increments/retains correct metadata
- queue isolation by queue name

## Acceptance Criteria

- Jobs can be canonically dispatched and persisted in a queue-independent format.
- Worker implementation can be added without changing public job identity or queue payload shape.

---

# Milestone 12 — Queue Workers, Retries, Timeouts, Failed Jobs, and Queued Listeners

## Goal

Complete background job execution and connect event listeners to queues where requested.

## Scope

Worker loop, job scopes, retries/backoff, timeout policy, reservation safety, graceful shutdown, failed-job storage, retry operations, and queued listeners.

## Requirements

### Worker

Implement process role:

```text
worker
```

Worker flow:

```text
bootstrap app
  ↓
connect queue
  ↓
reserve
  ↓
create job scope
  ↓
resolve canonical job
  ↓
deserialize
  ↓
execute
  ↓
ack / release / fail
  ↓
dispose scope
```

### Retry

Respect:

- tries
- attempt count
- backoff
- delayed retry
- non-retryable/fatal failure mechanism if included

### Timeout

Define timeout semantics clearly.

Use safe abort/process primitives where applicable.

Do not pretend arbitrary JavaScript can always be force-killed without consequences.

### Reservation

Define behavior when a worker dies before acknowledgement.

Reservation expiry/recovery must support at-least-once delivery.

### Failed Jobs

Define failed-job store abstraction and default development/test implementation.

Persist enough information to inspect/retry.

Support framework operations needed by future CLI commands:

- list
- retry
- forget
- flush

### Graceful Shutdown

On shutdown:

- stop reserving
- finish/release current work according to policy
- dispose job scope
- close driver/store resources

### Queued Listeners

Allow listener execution to be delegated to queue infrastructure.

Queued listeners must use canonical listener/event identities and queue serialization rules rather than a parallel background mechanism.

## Tests

### Automated

- worker executes queued job
- acknowledgement removes/resolves job
- retry increments attempts
- backoff delays retry
- max attempts enters failed store
- failed job can be retried
- graceful shutdown stops new reservations
- reservation expiry permits redelivery
- job scope is disposed after every attempt
- queued listener dispatches and executes
- worker restart does not require source scanning

### Behavioral

- run worker process against memory/test driver
- terminate worker during/after job and verify safe behavior

## Acceptance Criteria

- Bunwire has a complete background-job lifecycle.
- Queued listeners reuse the job/queue runtime.
- Delivery semantics are explicit and test-covered.

---

# Milestone 13 — Scheduling and Scheduled-Task Runtime

## Goal

Implement compiler-backed scheduled tasks and a Bun scheduler runtime with an architecture that can later support distributed locking.

## Scope

`@Schedule()`, generated schedule registry, scheduler process role, cron parsing/execution, central schedule configuration, job scheduling, overlap/single-server extension contracts, and lock provider.

## Requirements

### Decorated Tasks

Support:

```ts
@Schedule("0 4 * * *")
class CleanupExpiredSessions {
  async handle() {}
}
```

Requirements:

- canonical decorator symbol
- generated scheduled-task identity
- DI-managed task instance
- scheduled-task execution scope
- compiler validation of static schedule definitions where practical

### Scheduler Runtime

Implement process role:

```text
scheduler
```

The runtime must consume generated schedule metadata.

Do not scan classes at startup.

### Central Schedule Configuration

Support scheduling existing work through an API such as:

```ts
app.withSchedule(schedule => {
  schedule.job(GenerateDailyReport).dailyAt("04:00");
});
```

Final fluent method names may differ, but support:

- cron expression
- common cadence helpers
- scheduling an existing `@Job()`
- direct managed scheduled task

### Time Semantics

Define:

- timezone handling
- missed-run behavior
- startup behavior
- duplicate tick prevention
- clock precision expected by the scheduler

### Overlap and Distributed Safety

Introduce `ScheduleLockProvider`/equivalent from the beginning.

Architecture must permit later/current support for:

- without overlapping
- single-server execution

Provide a local/in-memory implementation for tests and single-process use.

Do not require Redis/SQL.

### Failure

Scheduled-task exceptions use common reporting/lifecycle behavior and must not silently kill the scheduler loop unless configured.

## Tests

### Compiler/Automated

- canonical schedule recognition
- invalid static schedule diagnostic
- generated task identity
- job reference validation
- DI planning

### Runtime/Automated

- due task executes
- non-due task does not execute
- scheduled job dispatches to queue
- timezone behavior
- overlap lock prevents duplicate local execution
- lock release on success/failure
- scheduled-task scope isolation
- task failure does not corrupt later ticks
- graceful scheduler shutdown

## Acceptance Criteria

- Scheduled work is compiler-backed and can execute directly or dispatch jobs.
- The design can support multi-instance locking without redesign.

---

# Milestone 14 — Commands and Bunwire CLI Runtime

## Goal

Provide managed application/framework commands and operational access to routes, queues, schedules, events, and application runtime roles.

## Scope

`@Command()`, command registry, command scope, argument/option parsing, exit behavior, and core operational commands.

## Requirements

### Application Commands

Support canonical command declaration:

```ts
@Command("users:cleanup")
class CleanupUsersCommand {
  async handle() {}
}
```

- compiler-discovered
- canonical command identity
- DI-managed
- command execution scope
- deterministic duplicate-name diagnostic

### Arguments and Options

Provide a clean model for:

- positional arguments
- named options
- boolean flags
- defaults
- validation/coercion where appropriate
- help/usage text

Exact decorator vs descriptor syntax should be chosen consistently with Bunwire managed-method planning.

### Framework Commands

Implement operational commands when their underlying milestone exists, including appropriate equivalents of:

- serve
- routes:list
- events:list
- jobs:list
- queue:work
- queue:failed
- queue:retry
- queue:forget
- schedule:run
- schedule:list

Do not create commands that require unimplemented infrastructure.

### Exit and Errors

- command exceptions use deterministic rendering/reporting
- exit codes are explicit
- resources/scopes dispose before exit

## Tests

### Compiler/Automated

- canonical command registration
- duplicate command rejection
- fake decorator rejection
- argument/option plan generation
- DI constructor planning

### Runtime/Automated

- command invocation
- args/options
- invalid usage
- exit code
- command scope isolation
- framework introspection commands reflect generated registries

### Behavioral

- invoke CLI in a real Bun process
- queue/schedule commands interact with their subsystems

## Acceptance Criteria

- Bunwire can operate the application from one managed CLI/runtime surface.
- CLI introspection relies on generated registries rather than runtime source scanning.

---

# Milestone 15 — Bun WebSockets

## Goal

Provide Bun-native managed WebSocket endpoints with proper compiler identity, connection/message scopes, DI, middleware/security bridge, and graceful shutdown.

## Scope

`@WebSocket()`, generated socket registry, Bun `Bun.serve()` WebSocket integration, connection lifecycle, message dispatch, publish/subscribe exposure where appropriate, and authentication during upgrade.

## Requirements

### Compiler

- canonical `@WebSocket(path)` declaration
- duplicate/conflicting socket route diagnostics
- generated socket registry
- canonical handler method/lifecycle mapping
- no runtime socket discovery

### Runtime

Use Bun's native WebSocket implementation.

Define lifecycle hooks such as appropriate equivalents of:

- open
- message
- close
- drain
- error/ping/pong only if useful and supported by chosen contract

Do not reproduce Bun's WebSocket server internally.

### Scopes

Implement:

```text
application
  ↓
websocket connection scope
  ↓
websocket message scope
```

Connection-local services/state remain isolated.

Message scope disposes after each message.

### Upgrade/Auth

Define the HTTP-upgrade bridge:

```text
HTTP request scope/context
        ↓
middleware/auth/authorization as configured
        ↓
upgrade
        ↓
connection context
```

Do not retain disposed HTTP request-scope objects inside long-lived connections.

Copy/translate only intended identity/session/context data into the connection scope.

### Messaging

Expose native Bun publish/subscribe/backpressure capabilities without hiding them behind an incompatible abstraction.

### Shutdown

Gracefully close/stop accepting connections according to application shutdown policy.

## Tests

### Compiler/Automated

- canonical socket discovery
- route conflict rejection
- fake decorator rejection
- handler planning

### Runtime/Automated

- upgrade succeeds
- open/message/close lifecycle
- DI
- connection scope isolation
- message scope isolation
- auth-denied upgrade
- authenticated context reaches connection safely
- multiple clients
- publish/subscribe behavior where exposed
- graceful shutdown

### Behavioral

- real WebSocket client/server integration test under Bun

## Acceptance Criteria

- Bunwire WebSockets are a managed application layer over Bun's native implementation.
- Long-lived connection state is scope-safe.

---

# Milestone 16 — Production Hardening, Testing Utilities, Documentation, and Compatibility Freeze

## Goal

Finish the package as a coherent production-ready initial release rather than stopping after individual features compile.

## Scope

Cross-feature integration, fake/test utilities, observability hooks, security review, graceful shutdown validation, performance sanity checks, public API cleanup, docs/examples, and compatibility guarantees for the first stable Bun package release.

## Requirements

### Cross-System Integration

Verify combined flows such as:

```text
HTTP
→ session
→ CSRF
→ auth
→ FormRequest
→ authorization
→ controller
→ event
→ queued listener/job
→ worker
```

and:

```text
scheduler
→ dispatch job
→ worker
```

and:

```text
HTTP
→ page
→ validation failure
→ session/flash/shared props
→ page navigation response
```

and:

```text
HTTP authenticated upgrade
→ WebSocket connection scope
→ messages
```

### Testing Utilities

Provide test-friendly abstractions/helpers for:

- HTTP application requests
- fake/recording events
- fake queue/dispatch assertions
- scheduler execution
- sessions/auth contexts
- WebSocket integration where practical

Avoid global mutable testing modes that leak between tests.

### Observability

Expose structured lifecycle metadata/hooks sufficient for external logging/tracing:

- request ID/context
- route
- duration
- job ID/name/attempt/queue
- event/listener
- scheduled task
- command
- WebSocket connection/message identifiers where appropriate

Do not build a full logging ecosystem unless already required.

### Security Review

Review:

- HTML/page payload escaping
- CSRF handling
- session fixation/regeneration
- cookie security defaults
- OAuth state handling
- authentication principal isolation
- authorization failure behavior
- error information disclosure
- queue payload safety
- job deserialization
- WebSocket upgrade authorization
- prototype pollution/object input risks where applicable

### Performance Sanity

Measure or assert no obvious framework-level pathological behavior in:

- route dispatch
- middleware expansion/runtime
- request-scope creation
- Form Request resolution
- event dispatch
- queue worker loop
- scheduler tick
- WebSocket message dispatch

Do not optimize speculatively at the cost of architecture.

### Documentation

Document:

- package bootstrap
- runtime roles
- controllers/routes
- middleware
- Form Requests
- sessions/CSRF
- auth/OAuth/authorization
- pages/Vite
- events/listeners
- jobs/queues/workers
- scheduling
- commands
- WebSockets
- testing
- extension points
- explicit non-goals

Provide at least one full example application demonstrating the major systems together.

### Compatibility Freeze

Before declaring the package complete:

- review decorator names
- review class-kind IDs
- review generated registry schema
- review queue envelope/version
- review page protocol/version
- review exception public surface
- review session contracts
- review runtime-role names
- review public exports

Any knowingly unstable internal API must remain non-public.

## Tests

### Automated

- complete package suite
- compiler fixture suite
- generated registry snapshots/structural assertions
- HTTP integration suite
- security subsystem suite
- queue/worker integration suite
- scheduler suite
- command suite
- WebSocket suite
- page/Vite integration suite
- shutdown/resource cleanup suite
- concurrency/scope-isolation suite

### Behavioral

Run the complete example app and verify:

- initial page load
- page navigation
- validation failure/success
- session persistence
- CSRF rejection/success
- login/logout
- authorization
- event/listener
- queued job
- worker retry/failure
- scheduled job
- command execution
- WebSocket connection/message
- graceful shutdown

## Acceptance Criteria

- The major subsystems work together without hidden special cases.
- No known architectural rewrite is required for ordinary additive features.
- Public APIs and persisted protocol formats required for the initial release are intentionally reviewed.
- Documentation matches actual behavior.
- All milestone progress files are complete.
- `progress.md` marks the package implementation complete and identifies only genuinely post-v1/additive future work.

---

# Features Intentionally Left Additive After These Milestones

The architecture should permit these later without requiring the package foundation to be rewritten:

- additional OAuth/OIDC providers
- richer policy/authorization conveniences
- additional session stores
- Redis-backed rate limiting
- Redis queue driver
- SQLite queue driver
- other queue backends
- distributed scheduler lock providers
- mail
- notifications
- broadcasting conveniences
- signed URLs
- localization
- storage/S3 conveniences
- pagination helpers
- health endpoints
- maintenance mode
- richer command UX
- more built-in validation rules for files/HTTP
- advanced page protocol features
- additional WebSocket conveniences
- extraction of genuinely generic job/schedule/Bun-scope concepts into Core

These are additive only if the milestones above preserve the contracts and extension points described in this plan.

---

# Definition of Complete

`@bunwire/bun` is considered complete for this plan when:

1. Bunwire can bootstrap one application under HTTP, worker, scheduler, and command roles.
2. Runtime execution scopes isolate all request/job/command/schedule/WebSocket-local state.
3. HTTP controllers and routes are compiler-generated and run through native `Bun.serve()`.
4. Bun middleware uses the established Bunwire middleware model completely.
5. Response and exception handling are centralized.
6. `@Request()` Form Requests integrate cleanly with `@bunwire/validation`.
7. Sessions, CSRF, authentication, OAuth integration, and authorization work as coherent subsystems.
8. Server-driven pages integrate with Bun HTTP and `@bunwire/vite`.
9. Bun applications consume Core's compiler-discovered, DI-managed events/listeners and direct dispatcher without redefining them.
10. Jobs are canonically identified, serializable, queueable, retryable, and executable by workers.
11. Queued listeners reuse the queue system.
12. Scheduled tasks are compiler-backed and can directly execute or dispatch jobs.
13. Managed CLI commands and framework operational commands work.
14. WebSockets use Bun's native implementation with Bunwire connection/message scopes.
15. Cross-feature integration, graceful shutdown, concurrency isolation, security review, testing utilities, and documentation are complete.
16. No ORM, SQL abstraction, model-binding framework, or runtime decorator-discovery shortcut has been introduced.
