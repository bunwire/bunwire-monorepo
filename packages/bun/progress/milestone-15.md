# Milestone 15 — Bun WebSockets

Status: Complete

## Packages Changed

- `packages/bun`, `packages/core`, `packages/vite`, and `examples/bun-app/websocket`.
- Architecture/package documentation, generated example registry, export allowlist, and tests.

## Implemented

- Added canonical `@WebSocket(path)` class discovery, required `message`, optional `open`/`close`/`drain`, compiler-generated plans, no caller contract, and GET route conflict diagnostics.
- Added generic optional/mixed intrinsic method policies and class-level middleware registry metadata without Bun-specific Core/Vite branches.
- Added native Bun upgrades, class/global middleware authorization, explicit identity snapshots, connection/message scopes, DI, lifecycle hooks, publish/subscribe access, and bounded socket shutdown.
- Added a standalone generated WebSocket example with an upgrade guard and mapped identity; updated architecture and package API documentation.

## Remaining

- None for Milestone 15.

## Acceptance Criteria

- [x] Bunwire WebSockets are a managed application layer over Bun's native implementation.
- [x] Long-lived connection state is scope-safe.

## Tests Added

- Compiler fixture tests for discovery, optional hooks, generated middleware and caller exclusion, fake decorators, duplicate/conflicting routes, and handler arity.
- Real Bun client/server test for denied/authorized upgrade, identity, lifecycle, connection/message isolation and disposal, multiple clients, native publish/subscribe, and shutdown.
- Identity snapshot tests for deep-copy isolation and rejection of request-scoped objects, getters, cycles, and non-JSON values; shutdown fallback test for a non-cooperative socket.
- Updated prior descriptor-identity tests for the added canonical socket class and method kinds.

## Tests Run

- `pnpm exec tsc -b packages/core packages/bun packages/vite --pretty false` — passed.
- `pnpm exec vitest run --config vitest.config.ts tests/bun/milestone-15/websocket-compiler.test.ts tests/bun/milestone-15/websocket-process.test.ts` — passed.
- `pnpm --filter @bunwire/example-bun-app generate` and `typecheck` — passed.
- `pnpm typecheck`, `pnpm check:boundaries`, and `pnpm test:built-exports` — passed.
- `pnpm build` — passed across packages and examples.
- `pnpm test` — 715 passed, 2 failed stale Milestone 1 descriptor-list expectations, with one unhandled Vite file-watch rejection after temporary fixture cleanup; see regression checks.
- `pnpm exec vitest run --config vitest.config.ts tests/bun/milestone-01/bun-adapter.test.ts tests/bun/milestone-01/bun-compiler.test.ts tests/bun/milestone-09/vite-pages.test.ts` — 16 passed after updating descriptor expectations; no unhandled error.
- Targeted Milestone 15 compiler and real Bun process reruns after the final fixture/runtime changes — 7/7 and 1/1 passed.

## Test Results

- Milestone 15: 15 tests covered across compiler (7), identity/shutdown (7), and real Bun process (1); all pass in their latest affected runs.
- Final workspace typecheck, build, package boundaries, and built public-export audit passed.
- The single full-suite invocation was not entirely green: two exact descriptor expectations were corrected and passed in the affected rerun; the Vite page-watch test also passed when rerun separately.

## Regression Checks

- The full workspace run exercised 95 files and 717 tests; 93 files/715 tests passed before the two stale descriptor expectations were updated. The three affected files then passed 16/16 in a targeted rerun.
- The new WebSocket example generates and builds; package boundary and built-export audits pass.

## Expected Behavior

- Generated socket routes upgrade through Bun's native server. Global/class middleware can deny the upgrade, and an identity mapper copies only durable JSON data into each connection.
- Each connection has one handler instance and an isolated connection scope; each message receives and disposes a child scope. Bun's native socket supports send, subscribe, publish, and backpressure settings.
- `app.stop()` sends close code `1001`, waits the configured grace, terminates stragglers, runs close hooks, disposes scopes, and stops native serving.

## Not Expected Yet

- Optional ping/pong/error hook conveniences and Milestone 16 production hardening.

## Important Decisions

- Named `message` hook is required; `open`, `close`, and `drain` are optional.
- Global and socket-class middleware run during HTTP upgrade.
- An explicit mapper selects durable connection identity data.
- Shutdown uses bounded grace followed by termination of remaining sockets.

## Known Limitations

- Bun 1.3.14 on Windows can leave the `server.stop(true)` promise pending after WebSocket close callbacks. The adapter bounds this final wait after invoking native stop; real Bun process exit passes.
- The full-suite run emitted an unhandled Vite watch rejection after a temporary page fixture had been removed. The page-watch test passed independently, and this was not caused by the WebSocket paths; monitor this pre-existing cleanup race in Milestone 16.

## Blockers

- None.

## Next

- Begin Milestone 16 according to `packages/bun/MILESTONES.md`.
