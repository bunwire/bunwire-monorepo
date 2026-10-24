# `@bunwire/bun` 0.1.1

`@bunwire/bun` is Bunwire's first-party Bun host adapter and application runtime integration.

## Source layout

The package keeps its public entrypoints at `src/index.ts`, `src/client.ts`, `src/react.ts`, `src/react-server.ts`, and `src/testing.ts`. Their package exports remain `@bunwire/bun`, `@bunwire/bun/client`, `@bunwire/bun/react`, `@bunwire/bun/react/server`, and `@bunwire/bun/testing`.

Implementation files are grouped by responsibility under `src/`: `foundation/` (adapter, definitions, scopes, observability), `http/` (routes, requests, responses, middleware, and HTTP conveniences), `security/` (sessions, authentication, authorization, CSRF, OAuth), `pages/` (page protocol and browser/React support), `jobs/` (queues and workers), `scheduling/`, `commands/`, `websocket/`, and `testing/`. Consumers should import from the public package entrypoints rather than these internal paths.

Milestones 1–15 provide the package foundation, explicit runtime roles, isolated execution scopes, generated native HTTP routes, middleware, response/exception handling, registered Form Requests, sessions/CSRF, authentication, OAuth integration, authorization, React server-driven pages, Core event/listener integration, generated jobs and workers, scheduling, managed commands, and Bun-native managed WebSockets. Milestone 16 integrates the example and compatibility checks; Milestones 17–23 add authorization conveniences, signed URLs, pagination, file validation, health reporting, maintenance control, rate limiting, command UX, advanced page responses, and WebSocket conveniences.

The [Bun example](../../examples/bun-app/README.md) combines the v2 features with the existing bootstrap, generated registry, and native host. It includes signed authenticated routes with rate limiting, bounded pagination, file validation with page errors, protected partial/deferred pages, optional SSR, operational endpoints, registry inspection commands, and authorized channels. The current page wire format remains version 1 by default; partial/deferred responses require the explicit protocol 2 navigation capability. Queue envelopes, session persistence, and generated registry schemas retain their existing formats.

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

## WebSockets

Decorate a class with `@WebSocket("/path")` and implement `message(client, message)`. Optional native hooks are `open(client)`, `close(client, code, reason)`, and `drain(client)`. Their client argument is Bun's actual `ServerWebSocket`, so `send`, `subscribe`, `publish`, and backpressure behavior remain native. The compiler generates the route and invocation plans and rejects duplicate socket paths or HTTP GET conflicts.

Socket-class `@Use()` and global middleware authorize the HTTP upgrade. Configure `http.websocket.mapIdentity(context)` to copy durable JSON identity data into the connection; request context and session objects are disposed after upgrade. Inject `BUN_WEBSOCKET_CONNECTION` into the handler constructor for connection context, or `BUN_WEBSOCKET_MESSAGE` into a message method for its short-lived child scope. Each connection has its own handler instance. Shutdown sends code `1001`, waits `http.websocket.shutdownGraceMs` (default 5000 ms), then terminates remaining sockets. `app.stop()` does not wait indefinitely for a handler that ignores the deadline; its connection and message scopes remain alive and are disposed if the handler later settles.

For typed text messages, define explicit payload validators with `defineBunWebSocketMessages({ chat: (value): value is ChatPayload => ... })`, then call `messages.decode(raw)` inside `message()`. The codec accepts only JSON `{ type, payload }` envelopes and can also `encode(type, payload)`. A malformed or binary message decoded by this helper closes that connection with code `1007`; ordinary handler failures still use `1011`. Existing handlers may continue to consume raw Bun messages.

For channels, configure `http.websocket.authorizeChannel({ channel, identity, connection })` using the durable identity snapshot and inject `BUN_WEBSOCKET_CHANNELS` into the handler. `join()` returns `false` on denial without closing the socket; absent policy denies joins. `leave()`, `send(connectionId, data)`, and `broadcast(channel, data)` wrap native Bun operations. Broadcast requires the sending connection to have joined the channel and excludes the sender, following Bun's default publish behavior. Results report `sent` with native bytes, `backpressure`, `dropped`, or `missing`; they do not imply persistence, retry, or exactly-once delivery. Helper-managed channels are limited to 32 per connection by default (`maxChannelsPerConnection`) and are removed on close and shutdown. Channel names use 1–128 printable non-space ASCII characters. Native socket APIs remain available for custom behavior.

```ts
import { BUN_WEBSOCKET_CHANNELS, WebSocket, defineBunWebSocketMessages, type BunWebSocketChannels } from "@bunwire/bun";
import { Inject } from "@bunwire/core";
import type { ServerWebSocket } from "bun";

const messages = defineBunWebSocketMessages({
  chat: (value: unknown): value is { text: string } =>
    typeof value === "object" && value !== null && typeof (value as { text?: unknown }).text === "string",
});

@WebSocket("/chat")
class ChatSocket {
  constructor(@Inject(BUN_WEBSOCKET_CHANNELS) private readonly channels: BunWebSocketChannels) {}

  async message(_client: ServerWebSocket<unknown>, raw: string | Buffer) {
    const envelope = messages.decode(raw);
    if (envelope.type === "chat" && await this.channels.join("room:general")) {
      this.channels.broadcast("room:general", messages.encode("chat", envelope.payload));
    }
  }
}
```

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

File uploads can use `file`, `maxFileBytes:N`, and `mime:type,...` in the same ruleset. `file` requires a native `File` or a nonempty array of files; the other rules check each file. `mime` compares the browser-supplied `File.type` metadata, so use an application content inspector when the actual bytes matter. These rules retain JSON 422 errors and the normal page request validation redirect.

## Signed URLs and pagination

Configure a separate signing secret and attach `@Use("signed")` to a generated HTTP route. The compiler includes the built-in middleware in the registry. Generate a link from `context.signedUrls`; verification returns the normal HTTP 403 for missing, changed, malformed, or expired signatures:

```ts
new BunAdapter({ http: {
  signedUrls: { secret: process.env.BUNWIRE_URL_SECRET!, origin: "https://example.com" },
  pagination: { defaultPageSize: 20, maxPageSize: 100 },
} });

// Inside a managed HTTP request:
const link = await context.signedUrls!.sign("/reports/42?format=pdf", { expiresInSeconds: 600 });
const absoluteLink = await context.signedUrls!.sign("/reports/42", { absolute: true });
```

The secret must contain at least 32 UTF-8 bytes. Links are relative by default; absolute links require an explicitly configured HTTP(S) origin. Verification binds the method (GET by default), path, ordered query pairs, and optional expiry. Query encoding is normalized through `URLSearchParams`; repeated query values keep their order. `bw_signature` and `bw_expires` are reserved. Replacing the secret invalidates outstanding links, so retain the old secret until existing links expire if they must remain usable. The request's Host and forwarding headers never choose the signing origin.

`context.pagination.input()` parses `page` and `perPage` into `{ page, pageSize, offset }`. Values must be positive safe integers, `perPage` must stay within the configured maximum, and duplicate parameters fail with HTTP 400. `context.pagination.result(items, total)` returns those values, `total`, `pageCount`, and relative `self`, `first`, `previous`, `next`, and `last` links. Links retain nonpagination filters, including repeated values. The application performs its own data query and count:

```ts
const { pageSize, offset } = context.pagination.input();
const [items, total] = await Promise.all([
  repository.list({ limit: pageSize, offset }),
  repository.count(),
]);
return context.pagination.result(items, total);
```

Both helpers are request scoped through `BUN_SIGNED_URLS` (when configured) and `BUN_PAGINATION` for explicit injection.

## Health and maintenance

Opt in to native health routes and maintenance control through the existing HTTP server:

```ts
new BunAdapter({ http: {
  health: {
    // Defaults: /health/live and /health/ready
    timeoutMs: 2_000,
    checks: {
      database: async (signal) => database.ping({ signal }),
    },
  },
  maintenance: {
    retryAfterSeconds: 60,
    authorizeBypass: (request) => verifyOperatorRequest(request),
  },
} });

// After app.start(), from an operator-controlled application path:
const maintenance = app.rootContainer.get(BUN_MAINTENANCE);
maintenance.enable();
maintenance.disable();
```

Import `BUN_MAINTENANCE` from `@bunwire/bun`. The control exists only when `http.maintenance` is configured. `initiallyEnabled: true` starts in maintenance mode; `enable(retryAfterSeconds?)` may override the configured retry interval. This state is local to one application process; operators must coordinate multiple instances themselves.

Liveness reports whether the native host server is listening. Readiness requires a running application, no maintenance, and every configured check to return `true`. Checks run concurrently within one probe, receive an `AbortSignal`, and share a 2-second response deadline by default. A `false` result, thrown error, or timeout yields HTTP 503. While a check run remains unsettled, later probes return 503 without starting another run; a check that ignores abort keeps readiness unavailable until it settles. If no checks are configured, readiness reflects application and maintenance state. Readiness becomes unavailable as shutdown begins, before the server stops. Neither endpoint reruns startup or Provider registration.

Health endpoints accept GET and HEAD; other methods return 405. Public responses contain only `{ "status": "ok" }` or `{ "status": "unavailable" }`, never check names or errors, and set `Cache-Control: no-store`. A custom `livenessPath` or `readinessPath` must be a distinct static root-relative path and cannot overlap a generated HTTP or WebSocket route.

Maintenance returns HTTP 503 for ordinary routes, page assets, unknown paths, and WebSocket upgrades. It includes a numeric `Retry-After` when configured. Health remains accessible: liveness returns 200 while the server listens, and readiness returns 503. `authorizeBypass(request)` is the sole bypass decision. It must explicitly verify operator authority using application-controlled credentials or identity; Bunwire does not trust any request header by itself. A callback returning anything but `true`, throwing, or exceeding `bypassTimeoutMs` (default 2 seconds) fails closed.

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

Request-scoped `context.authorization` also offers `allows()` and `denies()` alongside the existing `can()` and `authorize()`. All checks are async. Bind a named policy once with `policy(name, resource?)`; when the resource is omitted, it uses the policy's existing named route-parameter resolver. An explicit resource takes precedence. Unknown abilities or policies deny access, while `authorize()` throws the normal 403 exception.

For a Controller or page response, pass authorization state to the browser deliberately:

```ts
const canEdit = await context.authorization!.policy("post", post).allows("update");
return page("Posts/Show", { post, canEdit });
```

In a Form Request's `authorize()` method, return an allow check:

```ts
return this.context.authorization!.allows("posts.create");
```

An ordinary Service can receive request authorization as a method argument; it must not retain it beyond the request:

```ts
await postsService.update(post, context.authorization!);

// In PostsService:
async update(post: Post, authorization: BunAuthorizationContext<Principal>) {
  await authorization.policy("post", post).authorize("update");
  // Apply the update.
}
```

Do not retain request authorization context in an application-singleton Service. Methods on the policy helper evaluate against the current request principal; `denies()` is the inverse of `allows()`, and the helper's `authorize()` follows the same 403 path as `context.authorization.authorize()`.

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

Production manifests list exact generated assets, which the Bun runtime serves without filesystem scanning. Stale navigation versions receive `409` plus `X-Bunwire-Location`; development manifests omit version enforcement so Vite HMR stays active.

Milestone 22 adds an opt-in version 2 navigation capability. Version 1 clients still receive complete page props. A client can refresh selected props of its current page without discarding omitted values:

```ts
await app.client.visit("/dashboard", { only: ["activity"] });
```

Deferred props are marked in the Controller and fetched by the client in a fresh, authorized GET request. Every resolver finishes inside that request's scope; aborted or stale responses cannot update a newer navigation. Client renders run in order: a newer navigation can fetch while an earlier async render is pending, then waits for that render before committing. Completed renders notify subscribers in commit order, including when a newer navigation fails; a failed obsolete render does not block the newer navigation. A custom render callback's returned promise must settle after its UI work finishes. `onDeferredError` receives failures while the existing props stay intact.

```ts
return page("Dashboard", {
  title: "Dashboard",
  activity: defer(async (http) => loadActivity(http.auth?.principal)),
});

const app = await createBunwireReactApp({
  resolvePage,
  deferred: true,
  onDeferredError(error, keys) { console.error(keys, error); },
});
```

SSR is independent of partial and deferred props. Configure `pages.ssrEntry` in `bunwire.config.ts`, export `renderPage(page)` from that entry, and build it separately with `vite build --ssr src/page-server.ts --outDir dist/server`. The SSR build writes `bunwire-pages-server.json`; combine it with the browser manifest using `withBunPageServerManifest(browserManifest, serverManifest)`, then pass `ssr: createBunPageServerRenderer(manifest)` in `http.pages`. A React server entry can call `renderBunwireReactPage(page, resolvePage)` from `@bunwire/bun/react/server`. The browser app hydrates when the default shell carries SSR markup and mounts normally otherwise. Custom shells receive the rendered HTML as their third argument and must place it inside `#app` with `data-bunwire-ssr="true"` for React hydration.

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

Jobs require an exported concrete class, a stable explicit ID, and an own public non-overloaded `handle()`. Its parameters are payload-only (optional/default/rest supported); use constructor DI for framework values. Supported static protected defaults are compiled without instantiating jobs. Imported project-local constants, known arrays/spreads, and arithmetic such as `protected timeout = 60 * 1000` are accepted; queue/timeout/retry validators still apply. Registered decorator options use the same expression language. Consumed metadata mutation is unsupported, and runtime mutation cannot reconfigure generated records. Inheritance, computed members, and constructor-assigned policy are rejected. Defaults: queue `default`, tries `1`, no timeout, empty backoff. IDs must use letters/digits and `.`, `_`, `:`, or `-` and begin with a letter/digit.

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

Central job arguments must resolve to compiler-safe JSON data and satisfy the generated `handle()` contract. Project Milestone 17 supports local/imported constants, arithmetic, collection spreads, and known argument tuples in schedule targets, payloads, cadences, and modifiers; class targets retain canonical identity. For example, `schedule.job(JOBS[0], ...PAYLOAD).dailyAt(TIME).timezone(ZONE).id(ID)` is valid when those constants have supported initializers. Helpers, loops, and multiple schedule blocks remain deferred. Supported cadences are `cron()`, `everyMinute()`, `hourlyAt()`, and `dailyAt()`. Schedule modifiers are `timezone()`, `withoutOverlapping()`, `onOneServer()`, `lockFor()`, and `id()`.

Cron uses five minute-level fields and accepts wildcards, lists, ranges, steps, month/weekday names, and Sunday `0`/`7`. UTC is the default, the adapter may provide another default IANA timezone, and each schedule may override it. The current minute is evaluated once at startup, later absolute minutes are evaluated once, and missed minutes are skipped. DST gaps therefore skip nonexistent local minutes, while the two absolute minutes representing a repeated fallback time may both run.

Every direct occurrence receives a fresh transient task and `scheduled-task` scope. `BUN_SCHEDULE_CONTEXT` is frozen and exposes the resolved schedule definition, `scheduledAt`, `startedAt`, timezone, and scope. Scheduled jobs dispatch through the existing `QueueManager`, so an explicit queue driver is required.

`withoutOverlapping()` uses renewable fenced leases. The default `MemoryScheduleLockProvider` is process-local and supports that local overlap guarantee. `onOneServer()` requires an explicit stable ID and a custom `ScheduleLockProvider` whose capabilities declare distributed coordination; Bunwire does not imply a distributed guarantee from in-memory state. One provider instance belongs to one Application lifecycle.

User failures call `onError` or fall back to `console.error`, then continue by default. Set `failurePolicy: "stop"` to fail scheduler completion and request Core shutdown. Infrastructure and lease failures are always fatal. `app.stop()` prevents new ticks, waits for active work, releases locks, drains accepted queue work, disposes scopes, and closes the provider. See the runnable [scheduler example](../../examples/bun-app/README.md#scheduler-example).

## Commands and CLI runtime

Declare transient, compiler-discovered commands with constructor DI and explicit CLI parameter decorators:

```ts
@Command({
  name: "users:cleanup",
  description: "Remove inactive users.",
  examples: ["bunwire users:cleanup staff --days 30"],
})
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

`bunwire list` shows command descriptions. `bunwire help <name>` and `<name> --help` read generated metadata to show required inputs, types, defaults, choices, aliases, and declared examples. A `--help` after `--` remains a positional value.

Handlers can use `context.io.table(columns, rows)`, `context.io.progress(label, current, total)`, and `context.io.status(kind, message)` for plain, deterministic output. Existing custom I/O objects need only `stdout` and `stderr`; the command context supplies the helpers. For a prompt, a handler must explicitly call `await context.io.prompt({ message: "Continue?" })`. The default I/O reads from a terminal only when stdin and stdout are TTYs and CI is unset. In scripts, use `nonInteractiveValue` on that prompt or receive a usage error (exit code `2`). A custom I/O may opt in to interaction with `interactive: true` and an `input(message, signal)` callback, which also supports tests. Prompts do not fill missing CLI arguments automatically.

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

`include` and `exclude` match the actual case-sensitive URL pathname with `*` for one segment and `**` for multiple segments. `only` and `except` accept uppercase HTTP methods. The frozen context exposes the native HTTP context plus `path`, `method`, `transport: "http"`, and attachment parameters. The aliases `auth`, `guest`, `can`, `csrf`, `signed`, and `throttle` are reserved built-ins.

Global middleware, groups, nested groups, and Controller mappings use Core's `app.withMiddlewares()` policy. Generated attachments execute in `global → Controller mapping → Controller @Use → method @Use` order. Exact target-and-parameter duplicates run once; parameter-distinct attachments remain separate.

## Rate limiting

Configure named fixed-window policies on the Bun HTTP adapter and attach them through the built-in middleware alias:

```ts
import { BunAdapter } from "@bunwire/bun";
import { Controller, Use } from "@bunwire/core";
import { Get } from "@bunwire/bun";

const adapter = new BunAdapter<{ id: string }>({ http: {
  rateLimiting: { policies: [{
    name: "api",
    limit: 60,
    windowMs: 60_000,
    onBackendError: "closed",
    key: (context) => context.auth?.principal
      ? `user:${context.auth.principal.id}`
      : `guest:${context.request.headers.get("x-client-id") ?? "shared"}`,
  }] },
} });

@Controller("/api")
class ApiController {
  @Use("throttle:api")
  @Get("/items")
  items() { return { ok: true }; }
}
```

The example's `x-client-id` is an application-chosen identity and is spoofable by callers. Use it only when that sharing model is acceptable. If limiting by client address, derive the key from a trusted server address source or explicitly configure which proxies may supply forwarded addresses. Bunwire never trusts forwarding headers implicitly. The key callback must return a non-empty string. Authentication is initialized before rate limit middleware executes, and policy names namespace identities. Policies also work in `app.withMiddlewares()` groups, global attachments, and Controller mappings. Unknown policy names fail at startup.

The default `MemoryRateLimitBackend` is process-local and cannot enforce a shared limit across processes. Supply `rateLimiting.backend` to replace it. A backend implements `consume({ key, limit, windowMs })` as one atomic operation and returns `{ allowed, remaining, resetAtMs, retryAfterMs }`. Windows align to epoch multiples of `windowMs`; a rejected request does not consume quota. The backend owns the clock, returns reset time in epoch milliseconds and retry duration from that same clock, and expires buckets at their reset boundary. Concurrent calls for the same key/window must never allow more than `limit` requests. Distributed implementations should perform the decision and increment atomically on their authoritative clock. Backend errors follow each policy's required `onBackendError` choice: `open` continues, while `closed` returns safe HTTP 503. Exhausted quota returns HTTP 429 with a positive whole-second `Retry-After` and `Cache-Control: no-store`; backend details are not exposed.

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

Milestones 3 and 4 add canonical HTTP and HTTP-middleware context; Milestone 12 adds explicit `BUN_JOB_CONTEXT`; Milestone 13 adds `BUN_SCHEDULE_CONTEXT`; Milestone 14 adds `BUN_COMMAND_CONTEXT`; Milestone 15 adds WebSocket connection/message contexts.

## Testing

The opt-in `@bunwire/bun/testing` entrypoint contains instance-local helpers. `BunTestClient` sends real HTTP requests to a running application, retains response cookies for session/auth checks, and adds an explicit CSRF header through `csrfRequest()`. `connectWebSocket()` opens a native client when cookie headers are not needed. `RecordingEventDispatcher` can replace Core's dispatcher through an application Provider, while `RecordingQueueDriver` retains real memory-driver lease behavior and exposes dispatch assertions. `runScheduledTick()` calls a running application's idle scheduler at a specified timestamp.

```ts
import { BunTestClient, RecordingQueueDriver } from "@bunwire/bun/testing";

const queue = new RecordingQueueDriver();
const client = new BunTestClient("http://127.0.0.1:3000");
const session = await (await client.request("/api/session")).json();
await client.csrfRequest("/api/session", session.csrfToken, { method: "POST" });
queue.assertDispatched("app.some-job");
```

Create a fresh queue/dispatcher/client for each test and close the application and queue driver after use. The integrated example test under `tests/bun/milestone-16` shows a real Bun server, worker, authenticated WebSocket, and graceful shutdown.

## Observability

Pass `observability(record)` to `BunAdapter` to receive frozen `start` and `end` records for managed HTTP requests, Core listener delivery, job attempts, scheduled work, commands, and WebSocket upgrades/connections/messages. Records include operation IDs, applicable route or work identities, timestamps, end duration/outcome, and HTTP status. They exclude request bodies, credentials, session values, and job payloads. Every managed `BunHttpContext` also has a unique `requestId`; the HTTP records use the same ID. Hook failures are reported to `console.error` and do not alter the application result.

## Extension points and non-goals

Use Core's canonical adapter/compiler descriptors for new managed class kinds, method kinds, and parameter injectors; use `http.responseResolvers` and `http.exceptionHandler` for HTTP output/errors. Bun's `QueueDriver`, `JobSerializer`, `SessionStore`, and `ScheduleLockProvider` are the durable backend seams. `http.onServer` exposes the actual Bun server. These are intentional public contracts; generated registry records and queue/page versions are versioned boundaries.

This initial package does not include an ORM, SQL/model binding layer, Redis/SQLite queue drivers, distributed scheduler locks, full logging/tracing infrastructure, OAuth provider presets/OIDC, or host-managed browser rendering beyond the documented page/Vite integration. Memory queue and session stores are process-local. Multiple process roles require an application-supplied shared backend when they exchange work.

See [MILESTONES.md](MILESTONES.md), [SECURITY_REVIEW.md](SECURITY_REVIEW.md), and [progress.md](progress.md) for the implementation plan, security boundaries, and current status.

Optional OAuth/OIDC provider presets, durable session and queue stores, Redis rate limiting, distributed scheduler locks, mail, notifications, localization, and storage/S3 integrations remain separately planned. The built-in memory backends and WebSocket publish helpers do not provide cross-process durability or delivery guarantees.
