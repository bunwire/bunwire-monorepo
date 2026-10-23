# Milestone 19 — Operational HTTP Features

Status: Complete

## Packages Changed

- `@bunwire/bun`

## Implemented

- Opt-in native liveness/readiness endpoints on the existing `Bun.serve()` server, with a bounded response deadline, concurrent checks within one probe, and minimal public responses.
- Post-completion review correction: readiness allows only one unsettled check run; later probes return 503 until that run settles.
- Application-scoped runtime maintenance control, optional retry header, and explicit timeout-bounded authorization callback.
- Maintenance gate across generated routes, fallback/page assets, and WebSocket upgrades; health remains accessible.
- Health path validation and collision rejection, plus lifecycle-aware readiness during startup and shutdown.
- Bun package and architecture documentation, and public export allowlist update.

## Remaining

- None.

## Acceptance Criteria

- [x] Liveness and readiness distinguish host listening from dependency and application readiness.
- [x] Maintenance blocks ordinary HTTP while health and explicitly authorized operator requests remain available.
- [x] Features use the existing Bun server and Core lifecycle; non-HTTP roles remain HTTP-free.

## Tests Added

- `tests/bun/milestone-19/operational-http.test.ts` — health/check timeout, safe responses, maintenance control and fail-closed bypass.
- `tests/bun/milestone-19/http-integration.test.ts` — startup, shutdown, native route/fallback/WebSocket gate, path conflicts, role behavior.
- `tests/bun/milestone-19/operational-process.test.ts` and child fixture — real Bun server health and maintenance switching.
- Post-completion: `operational-http.test.ts` covers repeated probes during a check that ignores abort and recovery after that check settles.

## Tests Run

- `pnpm exec vitest run tests/bun/milestone-19/operational-http.test.ts`: 4 passed.
- `pnpm exec vitest run tests/bun/milestone-19/http-integration.test.ts`: 4 passed after correcting test registry metadata.
- `pnpm exec vitest run tests/bun/milestone-19/operational-process.test.ts`: 1 passed.
- `pnpm typecheck` passed; `pnpm --filter @bunwire/bun build` passed; `pnpm test:built-exports` passed after updating the intended export allowlist.
- `pnpm exec vitest run tests/bun`: 320 passed across 63 files.
- Final `pnpm exec vitest run tests/bun/milestone-19`: 10 passed across 3 files after adding configured-path and real Bun HEAD checks.
- Final `pnpm typecheck`, `pnpm --filter @bunwire/bun build`, `pnpm test:built-exports`, and `pnpm check:boundaries` all passed.
- `git diff --check` passed.
- Post-completion correction (2026-10-23): the focused Milestone 19 operational tests passed (5 tests); dependent HTTP integration and real Bun process tests passed (6 tests). The final combined affected run passed 20 tests across 6 files. `pnpm typecheck` and `pnpm --filter @bunwire/bun build` passed.

## Test Results

- All Milestone 19 tests pass. The initial integration fixture lacked required WebSocket parameter and class scope metadata; corrected fixture passed. The first export audit identified expected new public names; the updated allowlist passed.

## Regression Checks

- Full Bun package suite passed, covering HTTP, middleware, pages, WebSockets, roles, startup/shutdown, commands, and the real example.
- New Milestone 19 tests passed again after the only post-suite changes, which added test coverage and documentation. Vite-generated tracked example files from the broad suite were restored to their original state.
- Package boundary, typecheck, built export, and build checks passed.

## Expected Behavior

- Configured health endpoints report host liveness and application/dependency readiness without exposing check details.
- Configured maintenance can be toggled through `BUN_MAINTENANCE`; ordinary traffic is blocked with 503 while health and explicitly authorized bypasses work.

## Not Expected Yet

- Distributed maintenance coordination or a separate health server.

## Important Decisions

- Runtime maintenance control through an application-scoped token; an application callback explicitly authorizes bypass.
- During maintenance, liveness remains healthy while readiness becomes unavailable. Public health responses contain only a minimal status.

## Architectural Issues

- None identified.

## Known Limitations

- A readiness check that ignores abort can continue past the response deadline. New probes return 503 without launching overlapping work until it settles.

## Blockers

- None.

## Next Work Within This Milestone

- None. Milestone 20 is next in `MILESTONES-v2.md`.
