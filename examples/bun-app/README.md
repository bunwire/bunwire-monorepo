# Bunwire Bun HTTP example

This example demonstrates the Bun composition and native HTTP boundary:

- `bootstrap.ts` configures and exports Core's Application with `BunAdapter`;
- Bunwire's compiler generates the runtime registry without executing the bootstrap;
- a Core `@Controller()` uses Bun `@Get`, `@Post`, explicit `@Context()`, and a compiler-registered `@Request()` Form Request with constructor DI;
- canonical Core middleware is configured through a parameterized group, filters native HTTP paths/methods, adds response headers, and short-circuits one route;
- signed server-side sessions expose flash state and a CSRF token, while the built-in `csrf` alias protects the session mutation route;
- typed session authentication exposes the current principal synchronously, while generated `auth` and `can` middleware protect account, dashboard, and named-policy routes;
- `page()` selects generated React components, with request-aware auth/CSRF shared props, framework-neutral client navigation, Vite HMR, and hashed production assets;
- Core `@Event()` / `@Listener(Event)` declarations are compiler-discovered, and `POST /api/events/:id` awaits the injected Core dispatcher before returning the audit delivery count;
- `@Job({ id: "example.record-action" })` is compiler-discovered, and `POST /api/jobs/:id` submits through an explicitly configured `SyncQueueDriver`, returning a receipt and audit count after execution;
- `main.ts` loads that registry and starts once, with shutdown owned by Core and `BunAdapter` signal handling.

The server listens with Bun's native router. Try `GET /api`, `POST /api/echo/:id` with JSON `{ "message": "hello" }`, `GET /api/page` for the React shell, or `GET /api/session`. Send `X-Bunwire-Page: true` to page routes for JSON navigation payloads. `GET /api/login` establishes the example principal; reuse its cookie for authenticated routes and shared page state. The example disables the cookie's `Secure` flag only for local HTTP; production applications should keep the secure default and supply `BUNWIRE_SESSION_SECRET`.

```sh
pnpm --filter @bunwire/example-bun-app build
cd examples/bun-app
bun dist/src/main.js
```

For page development, run `pnpm --filter @bunwire/example-bun-app dev:pages` alongside the Bun server. Vite serves the entry and React page modules with HMR; the production build emits and consumes the generated asset manifest.

The event audit is an application-singleton, in-memory demonstration. Event aliases are generated metadata, not dispatch keys. Direct event dispatch creates its own Core invocation rather than inheriting the HTTP request scope; pass needed data in the event payload. Await dispatch so listener failures reach the HTTP exception pipeline and work finishes before the response.

The job audit is also in-memory. Job payloads round-trip through the default JSON serializer and execute with constructor DI in separate `queue-job` scopes. The HTTP example starts no worker loop; the sync driver awaits execution, enforces cooperative timeout but never retries or supports delay. `QueueExampleAction` additionally demonstrates Bun `@Queue` on a Core listener with an explicit event codec and a separate audit, without changing the direct delivery count.

## Worker example

The separate `worker/` source root has its own generated registry and composition root. It starts no HTTP server. After building above, run:

```sh
pnpm --filter @bunwire/example-bun-app worker:demo
```

The demo submits a job that succeeds on its second attempt and a queued Core listener whose codec reconstructs private event state. It waits for both, then drains through `app.stop()`. `pnpm --filter @bunwire/example-bun-app worker` runs until SIGINT/SIGTERM; the entrypoint observes `worker.done` and always awaits Core shutdown. Infrastructure failures produce a nonzero exit.

Both the queue and failed-job store are in-memory, process-local and non-durable. The standalone demo intentionally submits and consumes in the same process; it cannot receive work from this HTTP example. Cross-process deployments need an explicitly configured shared durable driver/store.

## Scheduler example

The separate `scheduler/` source root demonstrates both compiler-discovered `@Schedule()` work and central `withSchedule()` configuration for an existing `@Job()`. It uses the scheduler role, starts no HTTP server or queue worker, and evaluates the current minute once at startup:

```sh
pnpm --filter @bunwire/example-bun-app scheduler:demo
```

The demo runs the direct task in an isolated `scheduled-task` scope, dispatches the centrally configured job through the explicit sync queue driver, then shuts down through `app.stop()`. Run `scheduler` without `--demo` for a long-lived process using Bunwire's SIGINT/SIGTERM handling. The default lock provider is process-local; `onOneServer()` requires a distributed-capable custom provider.

## Command example

The separate `command/` source root declares a compiler-discovered `@Command()` with constructor DI plus generated `@Argument`, `@Option`, and `@Flag` parameters. `runBunCli()` starts the Core Application, executes one isolated command scope, awaits shutdown, and returns the process exit code:

```sh
pnpm --filter @bunwire/example-bun-app command:demo
pnpm --filter @bunwire/example-bun-app command -- routes:list
```

Run the command entrypoint without arguments to see generated application and framework commands. The command role starts no HTTP server, worker, or scheduler loop unless `serve`, `queue:work`, or `schedule:run` selects that subsystem.
