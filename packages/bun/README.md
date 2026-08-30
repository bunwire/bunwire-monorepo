# `@bunwire/bun` 0.1.1

`@bunwire/bun` is Bunwire's first-party Bun host adapter and application runtime integration.

Milestones 1–3 provide the package foundation, explicit runtime roles, isolated execution scopes, and generated native HTTP routes on Core's canonical Controllers. Middleware-aware HTTP responses and the remaining feature subsystems stay in their ordered milestones.

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

Routes come exclusively from the generated registry. Controller and method paths are normalized at compilation, route methods may not expose caller arguments, and request-specific values are explicit through `@Context()` or Core container injection. Until Milestone 5, successful handlers must return a native `Response`; thrown errors and unsupported values produce a minimal `500 Internal Server Error`. Compiled paths return deterministic 405 responses with `Allow`, and unmatched paths return 404.

## HTTP middleware

Core's canonical `@Middleware()` and `@Use()` declarations execute around Bun HTTP Controllers in the same managed invocation:

```ts
import type { BunMiddlewareContext } from "@bunwire/bun";
import { Middleware } from "@bunwire/core";

@Middleware()
export class AuthenticateMiddleware {
  protected alias = "auth";
  protected include = ["/api/**"];
  protected only = ["GET", "POST"];

  async handle(context: BunMiddlewareContext, next: () => Promise<unknown>) {
    return next();
  }
}
```

`include` and `exclude` match the actual case-sensitive URL pathname with `*` for one segment and `**` for multiple segments. `only` and `except` accept uppercase HTTP methods. The frozen context exposes the native HTTP context plus `path`, `method`, `transport: "http"`, and the parameters from references such as `@Use("auth:admin")`.

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

Milestones 3 and 4 add canonical HTTP and HTTP-middleware context. Job, command, schedule, and WebSocket contexts remain deferred to their owning milestones.

See [MILESTONES.md](MILESTONES.md) and [progress.md](progress.md) for the full implementation plan and current status.
