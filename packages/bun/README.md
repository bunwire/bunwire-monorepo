# `@bunwire/bun` 0.1.1

`@bunwire/bun` is Bunwire's first-party Bun host adapter and application runtime integration.

Milestone 1 provides the package foundation, explicit runtime roles, generated-registry consumption, Core-owned shutdown, and graceful SIGINT/SIGTERM handling. HTTP routing and all feature subsystems remain intentionally deferred to their ordered milestones.

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

`new BunAdapter()` defaults to the `http` role. The other initial roles are `worker`, `scheduler`, and `command`. Milestone 1 starts no role-specific feature resources, so selecting `worker`, `scheduler`, or `command` never starts `Bun.serve()`.

Core owns the terminal shutdown boundary:

```ts
await app.stop();
```

By default, `BunAdapter` converts the first SIGINT or SIGTERM into `app.stop()` and re-raises the signal only after adapter cleanup. Set `handleSignals: false` for embedded applications or tests that own process signals themselves.

See [MILESTONES.md](MILESTONES.md) and [progress.md](progress.md) for the full implementation plan and current status.
