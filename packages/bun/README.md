# `@bunwire/bun` 0.1.1

`@bunwire/bun` is Bunwire's first-party Bun host adapter and application runtime integration.

Milestones 1–14 provide the package foundation, explicit runtime roles, isolated execution scopes, generated native HTTP routes, middleware, response/exception handling, registered Form Requests, sessions/CSRF, authentication, OAuth integration, authorization, React server-driven pages, Core event/listener integration, generated jobs and workers, scheduling, and managed commands. Remaining feature subsystems stay in their ordered milestones.

```ts
// bootstrap.ts
import { defineApp } from "@bunwire/core";
import { BunAdapter } from "@bunwire/bun";

export default defineApp().withAdapter(new BunAdapter({
  role: "http",
}));
```

```ts
// main.ts
import registry from "virtual:bunwire/registry";
import app from "./bootstrap.js";

await app.withRuntimeRegistry(registry).start();
```

`new BunAdapter()` defaults to the `http` role and starts exactly one native `Bun.serve()` server. The other roles are `worker`, `scheduler`, and `command`; they do not start HTTP resources. Native server options are configured through `http`, including an `onServer` escape hatch for the exact Bun server object.

## HTTP routes

Use Core's `@Controller()` for the class identity and Bun's method decorators for HTTP meaning:

```ts
import { Context, Get, Post, type BunHttpContext } from "@bunwire/bun";
import { Controller } from "@bunwire/core";

@Controller("/api")
export class UsersController {
  @Get()
  index(): Response {
    return Response.json({ ok: true });
  }

  @Post("/users/:id")
  update(@Context() context: BunHttpContext): Response {
    return Response.json({ id: context.route.params.id });
  }
}
```

Routes come exclusively from the generated registry. Controller and method paths are normalized at compilation, route methods may not expose caller arguments, and request-specific values are explicit through `@Context()` or Core container injection.

## Responses and exceptions

Every Controller and middleware result passes through one response boundary. Native `Response` objects pass through unchanged, `undefined` becomes `204 No Content`, and JSON-compatible values become JSON responses. Redirects use the explicit helper:

```ts
import { Get, redirect } from "@bunwire/bun";

@Get("/home")
home() {
  return redirect("/", 303);
}
```

Add future page, file, or stream result types with ordered `http.responseResolvers`. A resolver receives the current active `BunHttpContext` and either returns a native `Response` or `undefined` to let the next resolver try.

Known failures use `BunHttpException` and its not-found, method-not-allowed, validation, unauthenticated, authorization, and CSRF subclasses. Unknown failures render a safe production 500. Explicit `http.mode: "development"` adds details only for unexpected errors; Bunwire does not infer this from `NODE_ENV`.

Applications may replace reporting and rendering through `http.exceptionHandler`. Route failures, unsupported results, native 404, and native 405 all use this handler; Bun's server-level `error` callback remains only a final minimal-500 safety boundary.

## Form Requests

Canonical `@Request()` classes extend Bun's `FormRequest` and compose the framework-independent `@bunwire/validation` engine:

```ts
import { FormRequest, Request } from "@bunwire/bun";

@Request()
export class CreateUserRequest extends FormRequest {
  rules() {
    return { name: "required|string", email: "required|email" };
  }
}
```

Use the exact decorated class as a Controller parameter. The compiler emits its identity and constructor DI plan; extending `FormRequest` without `@Request()` is not discovery.

The runtime collects query, body, and route values with `query < body < route` precedence. `sources.route`, `sources.query`, `sources.body`, and `sources.files` retain separate frozen views. JSON objects, urlencoded forms, multipart fields, repeated values, and native `File` objects are supported. Parsing uses a cloned request and does not consume `request.context.request`.

`prepareForValidation()` may call protected `merge()`, then `authorize()` runs, followed by `validateAsync()`. A ready instance exposes `context`, `all()`, `get()`, `errors`, and `validated()`. Authorization failures use 403; validation failures use the standard 422 JSON response. Middleware that short-circuits before `next()` does not parse or validate a Form Request.

## Sessions, cookies, and CSRF

Enable server-side sessions explicitly through HTTP options. Browser cookies contain only an HMAC-signed opaque ID; application state remains in the configured `SessionStore`:

```ts
new BunAdapter({
  http: {
    sessions: {
      secret: process.env.BUNWIRE_SESSION_SECRET!,
      // `MemorySessionStore` is the development/test default.
    },
  },
});
```

Session cookies default to `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`. Set `cookie.secure: false` only for plain-HTTP local development. `BunHttpContext` exposes `cookies`, `session`, and `csrf`; their matching runtime tokens support explicit container injection.

Sessions support serializable values, ID regeneration, invalidation/destruction, flash values, and old input. Flash values survive exactly the next request unless consumed earlier. Requests sharing one verified session ID serialize through commit so updates are not lost; unrelated sessions remain concurrent.

Attach the canonical built-in CSRF middleware with `@Use("csrf")` or Core middleware policy. Generate a form/header token with `await context.csrf.token()`. Safe methods are exempt. Unsafe requests must supply `X-CSRF-TOKEN` or `_token` in urlencoded/multipart form data; invalid tokens use the central 419 exception path. Session regeneration and invalidation rotate the token.

## Authentication, OAuth, and authorization

Authentication uses arbitrary application principal types. A session guard stores only the application-defined serializable key and resolves a fresh principal on later requests:

```ts
interface Principal { id: string; role: "admin" | "member" }

new BunAdapter<Principal>({
  http: {
    sessions: { secret: process.env.BUNWIRE_SESSION_SECRET! },
    auth: {
      defaultGuard: "session",
      guards: [createSessionAuthGuard({
        identify: (principal: Principal) => principal.id,
        resolve: (id: string) => users.find(id),
      })],
    },
    authorization: {
      abilities: {
        "dashboard.view": ({ principal }) => principal?.role === "admin",
      },
      policies: [{
        name: "post",
        resolve: (id) => posts.find(id),
        abilities: { update: ({ principal, resource }) => principal?.id === resource.ownerId },
      }],
    },
  },
});
```

The default guard resolves before middleware, so `context.auth.principal`/`user`, `check()`, and `guest()` are synchronous. `authenticate()`, `login()`, and `logout()` are asynchronous. `createBearerAuthGuard()` adds exact named bearer-token authentication without fallback to another guard.

Use generated `auth`, `guest`, and `can` middleware through Core `@Use()`. `@Use("auth:bearer")` selects an exact guard, `@Use("can:dashboard.view")` evaluates a global ability, and `@Use("can:update,post")` resolves the `:post` route parameter through the named policy. The same authorization manager is available directly through `context.authorization`; Form Request `authorize()` runs against it before validation.

OAuth remains application-routed. Configure providers under `auth.oauth`, return `await context.oauth.redirect("provider")` from an initiation route, and call `await context.oauth.callback("provider")` from its callback route. Bunwire stores one-time state and the S256 PKCE verifier server-side, maps the external identity through the application hook, and logs the resulting principal into a session guard. `createOAuth2Provider()` uses `oauth4webapi` for the Authorization Code exchange; OIDC and provider-specific presets remain deferred.

## React server-driven pages

Configure Vite page metadata under `http.pages` and return a named page from a Controller:

```ts
@Get("/dashboard")
dashboard() {
  return page("Dashboard", { title: "Dashboard" });
}
```

Initial requests receive an injection-safe HTML shell and serialized page state. Requests carrying `X-Bunwire-Page: true` receive versioned JSON instead. Shared props are async and request-aware; configured shared values merge in declaration order, then Controller props win. Selected session flash values are consumed once.

Page-aware Form Request validation uses a `303` redirect when a session is available. Override protected `flashInput()` to explicitly select safe old-input fields; errors and selected values appear once as `errors` and `old`. Non-page requests retain the normal `422` JSON response.

`@bunwire/bun/client` provides the framework-neutral navigation/history runtime. `@bunwire/bun/react` adds `createBunwireReactApp()`, `Link`, and `usePage()` without pulling server modules into the browser bundle. React and React DOM are optional peer dependencies.

Production manifests list exact generated assets, which the Bun runtime serves without filesystem scanning. Stale navigation versions receive `409` plus `X-Bunwire-Location`; development manifests omit version enforcement so Vite HMR stays active. SSR and deferred/partial props remain later extensions.

## Core events and managed listeners

Import event APIs from `@bunwire/core`; Bun requires no event option or parallel registry:

```ts
import { Event, EventDispatcher, Listener, Service } from "@bunwire/core";

@Event()
export class OrderPlaced {
  protected alias = "order.placed";
  constructor(readonly orderId: string) {}
}

@Service()
export class OrderAudit {
  readonly orderIds: string[] = [];
}

@Listener(OrderPlaced)
export class RecordOrder {
  constructor(private readonly audit: OrderAudit) {}
  handle(event: OrderPlaced): void { this.audit.orderIds.push(event.orderId); }
}

@Service()
export class Orders {
  constructor(private readonly events: EventDispatcher) {}
  async place(orderId: string): Promise<void> {
    await this.events.dispatch(new OrderPlaced(orderId));
  }
}
```

The compiler generates canonical event identities, optional aliases, ordered listener relationships, and constructor DI plans. Dispatch uses the exact event constructor, not its name or alias. Listeners run sequentially with the same event instance; a failure rejects dispatch and skips later listeners. Zero listeners is valid, and nested dispatch is supported.

Each dispatch has one root-parented Core invocation and one Provider `boot()` pass. It does not inherit the calling HTTP request's context, session, or local bindings. Pass needed domain data in the payload. Listeners remain application-singletons by default; Providers can explicitly bind both a listener and its dependencies in `context.container` during `boot()` for invocation-local resolution. Nested/concurrent invocations remain isolated.

For tests, a Provider's `register(container)` can replace `EventDispatcher` with a recording implementation using `container.instance(EventDispatcher, fake)`. Bun leaves that binding intact. Always await direct dispatch; there is no separate Bun event scope or detached-dispatch shutdown drain. Queued listeners and their event serialization remain later work.

## Jobs and queues

Configure a driver explicitly in the bootstrap: `new BunAdapter({ queues: { driver: new SyncQueueDriver() } })`. No default driver is selected. The `worker` role automatically starts consumption and requires a driver supporting reservations, delay, and renewal, such as `MemoryQueueDriver`. Other roles only dispatch. The manager is bound before Providers register; drivers initialize after Providers and registry consumption, before HTTP starts.

```ts
import { Job, BUN_QUEUE_MANAGER, type QueueManager } from "@bunwire/bun";
import { Inject, Service } from "@bunwire/core";

@Service()
export class InvoiceService { async generate(id: string) { /* application logic */ } }

@Job({ id: "billing.generate-invoice" })
export class GenerateInvoice {
  protected queue = "documents";
  protected tries = 3;
  protected timeout = 60_000;
  protected backoff = [1000, 5000];
  constructor(private readonly invoices: InvoiceService) {}
  async handle(invoiceId: string) { await this.invoices.generate(invoiceId); }
}

// In a managed class, inject the explicit token:
// constructor(@Inject(BUN_QUEUE_MANAGER) private readonly queue: QueueManager) {}
// await this.queue.job(GenerateInvoice, invoiceId).onQueue("priority").dispatch();
```

Jobs require an exported concrete class, a stable explicit ID, and an own public non-overloaded `handle()`. Its parameters are payload-only (optional/default/rest supported); use constructor DI for framework values. Literal protected defaults are compiled without instantiating jobs. Inheritance, computed members, and constructor-assigned policy are rejected. Defaults: queue `default`, tries `1`, no timeout, empty backoff. IDs must use letters/digits and `.`, `_`, `:`, or `-` and begin with a letter/digit.

`queue.job(JobClass, ...args)` returns an immutable, non-thenable builder. `onQueue(name)`, `delay(milliseconds)`, and `tries(count)` return new builders. Only `.dispatch()` submits; repeating it on the same builder returns the same promise/receipt. Payload and policy are snapshotted at submission. Receipts contain `{ id, job, queue }`, not handler results. Delay requires a capable driver. Sync execution never retries or persists failed attempts. It enforces cooperative timeouts through `BUN_JOB_CONTEXT`: constructor injection receives the frozen envelope, current scope, and `AbortSignal`. Timeout aborts the signal but awaits actual handler settlement before disposing the scope. Synchronous overruns are detected on settlement; uncooperative handlers can delay shutdown.

`JsonJobSerializer` (`bun.json`, version 1) serializes argument tuples. It rejects undefined entries, sparse arrays, cycles, accessors, hidden/symbol properties, functions, bigint, non-finite/unsafe integer/negative-zero numbers, and non-plain instances such as Date/Map. Omitted trailing optional arguments are valid. A custom `JobSerializer` supplies `id`, positive integer `version`, `serialize(tuple): string`, and `deserialize(payload): readonly unknown[]`.

`QueueEnvelope` version 1 contains unique `id`, canonical `job`, serialized `payload`, serializer identity/version, `queue`, `attempts`, Unix-millisecond `createdAt`/`availableAt`, and frozen `policy`. `QueueDriver` declares delay/reservation capabilities and implements `initialize`, `push`, `reserve`, `acknowledge`, `release`, `fail`, and `close`. One driver instance belongs to one Application lifecycle; never share it between Applications.

- `SyncQueueDriver` awaits one deserialized execution through Core in a new `queue-job` scope. Each job instance is transient; Provider boot and constructor DI inherit that scope, never the calling HTTP scope. Scope cleanup completes before dispatch resolves, preserving handler/cleanup failures together. It rejects delays and reservation operations.
- `MemoryQueueDriver` is process-local and non-durable. `reserve(queue, leaseMilliseconds)` picks available jobs by availability then insertion order, increments attempts and returns a unique expiring lease. Ack/release/fail require that current lease; expired work can be redelivered. Release retains attempts and applies a numeric delay. Fail removes reservable work after the worker has saved its terminal record. Closing drops remaining in-memory work. Drivers guarantee at-least-once semantics, not exactly-once; handlers should be idempotent.

`QueueDriver` optionally advertises `capabilities.renewal` and implements `renew(reservation, leaseMilliseconds)`. The memory driver extends a live lease without changing its token or attempts, never shortens expiry, and rejects stale renewals or settlement. Worker consumption requires this capability; dispatch-only custom drivers remain compatible.

`queues.failedJobs` accepts a `FailedJobStore`, defaulting to non-durable `MemoryFailedJobStore`. Stores initialize and close with the Application and cannot be shared across Applications. Records contain the original envelope, failure time, terminal reason, and safe error details. `listFailed()`, `getFailed(id)`, `retryFailed(id)`, `forgetFailed(id)`, and `flushFailed()` expose management through `QueueManager`. Retry preserves payload/serializer/policy, resets attempts, and uses a new immediately available ID; the original record remains until explicitly removed. Repeated retries deliberately submit distinct jobs. Closing the default memory store clears its records.

For workers, configure `queues.worker` with `queues` (default `["default"]`), `concurrency` (default `1`), `pollIntervalMs` (default `250`), and `leaseDurationMs` (default `30000`). Queue names must be unique and nonempty; numbers are positive safe integers. Worker options are rejected on other roles. `BUN_QUEUE_WORKER` resolves the adapter-owned `QueueWorker`, exposing frozen options, `state`, `activeCount`, and `done`. Entry points should await `done` and always await `app.stop()` in `finally`; infrastructure failure rejects both worker completion and Core shutdown. Reservation polling begins on the next event-loop turn after Core reaches running, rotates queues fairly, and respects concurrency.

Each reservation is one attempt. Acknowledgement follows successful execution **and scope disposal**. Retry delay uses `backoff[attempts - 1]`, clamped to the last entry (or zero for an empty array). `BunJobFatalError`, invalid job/serializer/payload identities, and exhausted attempts are terminal. Workers save a safe failed-job record before removing terminal work. If saving fails, they stop without acknowledging/removing it, allowing the external backend's lease-expiry recovery; this is not a distributed transaction. Leases renew during invocation, disposal, and failed-record persistence. Outstanding renewal finishes before ack/release/fail. Lease loss aborts the attempt, prohibits stale settlement, and requests Core shutdown.

Shutdown rejects new dispatch, stops reservations/HTTP, releases reservations arriving after shutdown, and waits for accepted attempts without aborting them just because of graceful stop. Configured timeouts remain active and leases keep renewing. It then disposes remaining scopes, closes both driver and failed-job store, and removes signals. Startup rollback closes partially initialized resources. See the runnable [worker example](../../examples/bun-app/README.md#worker-example). Built-in durable drivers/stores remain deferred.

### Queued Core listeners

Apply Bun's supplementary `@Queue()` to Core's existing `@Listener()` (either decorator order). It requires an explicit stable ID sharing the job namespace, with optional `queue`, `tries`, `timeout`, and `backoff` using job-policy defaults. The compiler emits an attachment sidecar without replacing the canonical listener/event definitions or dispatcher.

```ts
@Queue({ id: "notifications.welcome", queue: "notifications", tries: 3 })
@Listener(UserRegistered)
export class SendWelcome {
  async handle(event: UserRegistered) { /* business work */ }
}

const registeredCodec = defineQueueEventCodec({
  id: "events.user-registered",
  version: 1,
  event: UserRegistered,
  encode: (event) => ({ userId: event.userId }),
  decode: (payload) => new UserRegistered(payload.userId),
});
// BunAdapter queues: { driver, eventCodecs: [registeredCodec] }
```

Each queued event requires one unambiguous configured codec. IDs and versions are validated; encode/decode are synchronous, explicitly typed, and decode must construct the exact canonical event class. No constructor-name lookup or prototype hydration is used, so constructors/private state remain intact. Encoded data must satisfy the configured job serializer. Async codec results are rejected.

Core preserves direct dispatch order and one event invocation/Provider boot. When dispatch encounters a queued listener, its codec snapshots the event's current state and submission is awaited; failed submission rejects dispatch and skips later listeners. An explicit replacement dispatcher still bypasses the default behavior. The envelope's `job` is the selected listener's stable ID and its serialized tuple contains codec ID/version and encoded data. A worker invokes only that listener's generated `handle` plan in a fresh `queue-job` scope, binding the listener transiently and running normal Provider boot/constructor DI. Direct listeners retain Core's singleton defaults. No parent event, request, session or invocation context is inherited, and decoding never redispatches the event or repeats fan-out.

## Scheduling

The `scheduler` role consumes compiler-generated schedules and starts no HTTP server or queue worker. Define direct managed work with `@Schedule()`:

```ts
@Schedule("0 4 * * *")
export class CleanupExpiredSessions {
  constructor(
    private readonly sessions: SessionService,
    @Inject(BUN_SCHEDULE_CONTEXT) private readonly context: BunScheduledTaskContext,
  ) {}

  async handle() { await this.sessions.cleanup(); }
}
```

Or schedule an existing `@Job()` or canonical scheduled task centrally. `withSchedule()` is compile-only—its callback is type-checked and analyzed by Vite but never run by Core:

```ts
export default defineApp()
  .withAdapter(new BunAdapter({
    role: "scheduler",
    queues: { driver },
    scheduler: { timezone: "UTC" },
  }))
  .withSchedule((schedule) => {
    schedule.job(GenerateDailyReport, "daily")
      .dailyAt("04:00")
      .withoutOverlapping()
      .id("reports.daily");
  });
```

Central job arguments must be compiler-safe JSON literals and satisfy the generated `handle()` contract. Supported cadences are `cron()`, `everyMinute()`, `hourlyAt()`, and `dailyAt()`. Schedule modifiers are `timezone()`, `withoutOverlapping()`, `onOneServer()`, `lockFor()`, and `id()`.

Cron uses five minute-level fields and accepts wildcards, lists, ranges, steps, month/weekday names, and Sunday `0`/`7`. UTC is the default, the adapter may provide another default IANA timezone, and each schedule may override it. The current minute is evaluated once at startup, later absolute minutes are evaluated once, and missed minutes are skipped. DST gaps therefore skip nonexistent local minutes, while the two absolute minutes representing a repeated fallback time may both run.

Every direct occurrence receives a fresh transient task and `scheduled-task` scope. `BUN_SCHEDULE_CONTEXT` is frozen and exposes the resolved schedule definition, `scheduledAt`, `startedAt`, timezone, and scope. Scheduled jobs dispatch through the existing `QueueManager`, so an explicit queue driver is required.

`withoutOverlapping()` uses renewable fenced leases. The default `MemoryScheduleLockProvider` is process-local and supports that local overlap guarantee. `onOneServer()` requires an explicit stable ID and a custom `ScheduleLockProvider` whose capabilities declare distributed coordination; Bunwire does not imply a distributed guarantee from in-memory state. One provider instance belongs to one Application lifecycle.

User failures call `onError` or fall back to `console.error`, then continue by default. Set `failurePolicy: "stop"` to fail scheduler completion and request Core shutdown. Infrastructure and lease failures are always fatal. `app.stop()` prevents new ticks, waits for active work, releases locks, drains accepted queue work, disposes scopes, and closes the provider. See the runnable [scheduler example](../../examples/bun-app/README.md#scheduler-example).

## Commands and CLI runtime

Declare transient, compiler-discovered commands with constructor DI and explicit CLI parameter decorators:

```ts
@Command({ name: "users:cleanup", description: "Remove inactive users." })
export class CleanupUsers {
  constructor(private readonly users: UserService) {}

  async handle(
    @Argument({ name: "team", choices: ["staff", "guests"] }) team: string,
    @Option({ name: "days", alias: "d", type: "integer", default: 30 }) days: number,
    @Flag({ name: "force", alias: "f" }) force: boolean,
  ) {
    await this.users.cleanup({ team, days, force });
  }
}
```

`@Argument`, `@Option`, and `@Flag` compile into resolver plans; command handlers have no caller transport contract. Values support string, finite-number, and safe-integer coercion plus required/default and literal choices. The parser accepts `--name value`, `--name=value`, `-n value`, boolean flags, and `--`. Unknown or duplicate options, malformed short groups, missing/extra arguments, and failed coercion are usage errors.

Use a separate command-role composition root and let `runBunCli()` own the one-shot lifecycle:

```ts
process.exitCode = await runBunCli(app, registry);
```

The runner starts the Core Application once, executes one `command` scope, always awaits `app.stop()`, and returns the final code without calling `process.exit()`. `void` means `0`; handlers may return an integer from `0` through `255`. Usage errors return `2`, while startup, execution, and cleanup failures return `1`. Advanced integrations can resolve `BUN_COMMAND_RUNTIME` and provide a `BunCommandIO`; the frozen `BUN_COMMAND_CONTEXT` is available through normal token injection.

Built-in commands are `help`, `list`, `serve`, `routes:list`, `events:list`, `jobs:list`, `queue:work`, `queue:failed`, `queue:retry`, `queue:forget`, `schedule:run`, and `schedule:list`. Their names are reserved. Introspection reads only the generated registry. The command role does not start HTTP, a worker, or the scheduler loop at application startup; `serve`, `queue:work`, and `schedule:run` activate only their required facilities. HTTP, worker, and scheduler options are therefore also valid on a command-role adapter.

## HTTP middleware

Core's canonical `@Middleware()` and `@Use()` declarations execute around Bun HTTP Controllers in the same managed invocation:

```ts
import type { BunMiddlewareContext } from "@bunwire/bun";
import { Middleware } from "@bunwire/core";

@Middleware()
export class ExampleMiddleware {
  protected alias = "example";
  protected include = ["/api/**"];
  protected only = ["GET", "POST"];

  async handle(context: BunMiddlewareContext, next: () => Promise<unknown>) {
    return next();
  }
}
```

`include` and `exclude` match the actual case-sensitive URL pathname with `*` for one segment and `**` for multiple segments. `only` and `except` accept uppercase HTTP methods. The frozen context exposes the native HTTP context plus `path`, `method`, `transport: "http"`, and attachment parameters. The aliases `auth`, `guest`, `can`, and `csrf` are reserved built-ins.

Global middleware, groups, nested groups, and Controller mappings use Core's `app.withMiddlewares()` policy. Generated attachments execute in `global → Controller mapping → Controller @Use → method @Use` order. Exact target-and-parameter duplicates run once; parameter-distinct attachments remain separate.

Core owns the terminal shutdown boundary:

```ts
await app.stop();
```

By default, `BunAdapter` converts the first SIGINT or SIGTERM into `app.stop()` and re-raises the signal only after adapter cleanup. Set `handleSignals: false` for embedded applications or tests that own process signals themselves.

## Execution scopes

`BunExecutionScopeManager` is bound in the Core application container under `BUN_EXECUTION_SCOPE_MANAGER`. It creates isolated child-container scopes for HTTP requests, queue jobs, commands, scheduled tasks, and WebSocket connections/messages:

```ts
import {
  BUN_EXECUTION_SCOPE_MANAGER,
} from "@bunwire/bun";
import { createToken } from "@bunwire/core";

const CURRENT_JOB = createToken<{ id: string }>("app.current-job");
const manager = app.rootContainer.get(BUN_EXECUTION_SCOPE_MANAGER);

await manager.run("queue-job", async (scope) => {
  scope.value(CURRENT_JOB, { id: "job-42" });
  scope.resolve(CURRENT_JOB); // available only inside this scope
});
```

Use `scope.scoped()` for one cached instance per scope. A scoped binding may supply an explicit disposer; cleanup never relies on a method-name convention. Descendants and resolved resources dispose in LIFO order, and multiple failures are preserved in an `AggregateError`.

WebSocket message scopes require a live WebSocket connection scope as their parent. Other child kinds attach directly to the application scope. `app.stop()` rejects new scopes, waits for active `manager.run()` executions, and disposes remaining scopes before Bunwire's signal handlers are removed.

Milestones 3 and 4 add canonical HTTP and HTTP-middleware context; Milestone 12 adds explicit `BUN_JOB_CONTEXT`; Milestone 13 adds `BUN_SCHEDULE_CONTEXT`; Milestone 14 adds `BUN_COMMAND_CONTEXT`. WebSocket contexts remain deferred to their owning milestone.

See [MILESTONES.md](MILESTONES.md) and [progress.md](progress.md) for the full implementation plan and current status.
