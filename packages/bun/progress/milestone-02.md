# Milestone 2 — Execution Scopes and Contextual Resolution

Status: Complete

## Packages Changed

- `packages/bun`
- `scripts/check-boundaries.mjs`
- Bun, architecture, release-boundary, and public-export tests
- package/root documentation and progress records

## Implemented

- Added public canonical descriptors for `application`, `http-request`, `queue-job`, `command`, `scheduled-task`, `websocket-connection`, and `websocket-message` scope kinds.
- Added `BunExecutionScopeManager`, `BunExecutionScope`, manager/current-scope tokens, typed factories/disposers/options, lifecycle states, and deterministic scope errors.
- Built every non-application scope on a Core child container, preserving application singleton identity while isolating child-local contextual values and cached services.
- Enforced application parents for normal scope kinds and live WebSocket connection parents for WebSocket message scopes.
- Added explicit value/scoped-service registration, duplicate-local-binding rejection, descendant shadowing, and per-scope singleton resolution.
- Added idempotent descendant/resource disposal in reverse order, complete cleanup attempts, flattened aggregate disposal failures, and combined handler/cleanup failure preservation.
- Added `manager.run()` as the managed create/configure/execute/dispose boundary with concurrent-run tracking.
- Integrated the manager into `BunAdapter`: application preparation binds the manager and current application scope; shutdown rejects new scopes, waits for active runs, disposes remaining manual scopes, and removes signal handlers afterward even when cleanup fails.
- Added an architecture gate rejecting `AsyncLocalStorage`/`async_hooks` contextual-state machinery in Bun production source.
- Updated the package README, architecture guide, centralized test map, public-export allowlist, package test script, and progress indexes.

## Remaining

- None for Milestone 2.

## Acceptance Criteria

- [x] Canonical Bun scope kinds and parent relationships are public and immutable.
- [x] Contextual values and scoped services remain isolated to their scope hierarchy.
- [x] Scoped instances are cached per scope and application singletons remain shared.
- [x] Scope and resource disposal is deterministic, idempotent, and failure-safe.
- [x] WebSocket message scopes require and inherit from connection scopes.
- [x] Concurrent HTTP-like and job-like executions do not leak state.
- [x] Graceful shutdown rejects new scopes, waits for managed executions, and disposes remaining scopes.
- [x] Public exports, package artifacts, documentation, and progress records are current.
- [x] Focused and full quality gates pass.

## Tests Added

- Canonical descriptor identity, immutability, and parent rules.
- Same-scope reuse, sibling isolation, application-singleton sharing, current-scope tokens, scope-local visibility, and descendant shadowing.
- WebSocket connection/message hierarchy, inheritance, separate-connection isolation, parent liveness, and cascading disposal.
- LIFO child/resource disposal, unresolved-resource exclusion, idempotence, single/multiple failures, and combined execution/cleanup failures.
- Duplicate, foreign, closing, and disposed scope misuse diagnostics.
- Concurrent HTTP-like and queue-job-like contextual isolation.
- Core-owned shutdown waiting, new-scope rejection, manual-scope cleanup, signal-handler ordering, and cleanup-failure propagation.
- Deliberate architecture rejection for AsyncLocalStorage/global-context machinery.

## Tests Run

- `pnpm --filter @bunwire/bun test`
- `pnpm test tests/milestone-00/architecture.test.ts tests/milestone-13/release-architecture.test.ts tests/bun/milestone-02/execution-scopes.test.ts`
- `pnpm typecheck`
- `pnpm check:boundaries`
- `pnpm test`
- `pnpm build`
- `pnpm test:built-exports`
- `pnpm test:release-pack`
- `pnpm test:clean-install`
- `pnpm quality`

## Test Results

- Bun package suite: 4 files / 28 tests passed.
- Focused architecture/release/scope verification: 3 files / 23 tests passed.
- Final full Vitest suite: 41 files / 412 tests passed.
- Final typecheck, package boundaries, Electrobun 1.18.1 SDK contract, workspace build, and built-export audit passed through `pnpm quality`.
- Release tarball contents, manifests, isolated typechecking, and ESM imports passed for every release package.
- Clean frozen-lockfile install and workspace typecheck passed.
- An intermediate full-suite run passed 411 tests and failed one exact-object assertion because the release boundary checker gained the new `bunGlobalContext` result key. The expected result was updated; the focused rerun and final 412-test quality run passed.
- The first release-package audit attempt was denied npm network access by the sandbox. The authorized rerun passed without implementation changes.
- Known warning: Vite reports the existing intentional dynamic Electrobun import during real virtual-module/build coverage; it remains non-failing and unrelated to Bun Milestone 2.

## Regression Checks

- Core binding scopes remain exactly `singleton | transient`; no Core source or public API changed.
- Existing Core invocation scopes, Providers, middleware, events/listeners, and adapters continue to pass.
- Bun production source contains no runtime filesystem discovery, cross-package source import, AsyncLocalStorage, or `async_hooks` dependency.
- Existing Bun Milestone 1 adapter, registry, process, and signal tests remain green.
- All release packages still build, pack, import, and typecheck in isolated consumers.

## Expected Behavior

After this milestone:

- Every later Bun subsystem can create an explicit child-container execution scope without global mutable current-context state.
- Values registered in a scope are visible only to that scope and its descendants.
- Scoped services resolve once per owning scope and are distinct across sibling scopes.
- WebSocket message scopes inherit connection state and dispose before their connection scope.
- Scope cleanup is LIFO, idempotent, exhaustive, and preserves every failure.
- Application shutdown waits for active managed scope executions and disposes remaining Bun-owned scope resources before completing adapter cleanup.

## Not Expected Yet

- HTTP serving, controllers, middleware transport, queue workers, commands, scheduling, or WebSocket transport.
- Concrete HTTP/job/command/schedule/WebSocket context tokens before those public context types exist.
- Provider/container disposal or additional Core binding-scope kinds.
- AsyncLocalStorage-based implicit current-scope lookup.

## Important Decisions

- Scope primitives are public extension points for later Bun subsystems and manual integrations.
- `manager.run()` is the canonical managed execution boundary; manually created scopes are still reclaimed during shutdown.
- Scoped lifecycle ownership is explicit through typed disposer callbacks and never inferred from method names.
- Disposal traverses descendants/resources in LIFO order, attempts all cleanup, and flattens nested cleanup aggregates.
- The frozen `BunRuntimeContext` remains role-only; the scope manager is exposed through its canonical Core container token.
- Context-specific tokens remain deferred until their owning feature milestone can provide a concrete public type.

## Known Limitations

- Graceful shutdown waits indefinitely for a managed `manager.run()` handler that never settles; subsystem-specific timeouts/cancellation policies belong to the milestones that own that work.

## Blockers

- None.

## Next Work Within This Milestone

- None. Milestone 2 is complete.
