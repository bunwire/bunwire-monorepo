# Milestone 20 — Rate Limiting Foundation

Status: Complete

## Packages Changed

- `@bunwire/bun`

## Implemented

- Public fixed-window backend and process-local implementation.
- Named policies with explicit request keys and backend failure choices.
- Built-in `throttle` middleware descriptor and HTTP runtime wiring.

## Remaining

- None.

## Acceptance Criteria

- [x] One-process HTTP rate limiting works through named middleware policy.
- [x] Public backend contract supports a separate Redis implementation.
- [x] Required tests and affected regressions pass.

## Tests Added

- `tests/bun/milestone-20/rate-limiting.test.ts` — atomic memory/fake backend semantics, malformed policies, backend failure, and dependency boundary.
- `tests/bun/milestone-20/throttle-compiler.test.ts` — local and centralized generated attachments.
- `tests/bun/milestone-20/http-integration.test.ts` — authenticated and anonymous HTTP quota enforcement and startup diagnostics.

## Tests Run

- `pnpm --filter @bunwire/bun build` — passed.
- `pnpm exec vitest run tests/bun/milestone-20` — 8 passed across 3 files.
- `pnpm check:boundaries` — passed.
- `pnpm test:built-exports` — passed.
- `pnpm typecheck` — passed after correcting the integration fixture.
- `pnpm exec vitest run tests/bun/milestone-04 tests/bun/milestone-08 tests/bun/milestone-18 tests/bun/milestone-19` — 51 passed across 14 files.
- `pnpm exec vitest run tests/bun/milestone-01/bun-adapter.test.ts tests/bun/milestone-01/bun-compiler.test.ts` — 11 passed after updating built-in descriptor expectations.
- `pnpm exec vitest run tests/bun/milestone-09/vite-pages.test.ts` — 5 passed.
- Final `pnpm exec vitest run tests/bun` — 329 passed across 66 files.
- `git diff --check` — passed.

## Test Results

- All Milestone 20 tests and final Bun package tests pass. Build, typecheck, boundary, and public export checks pass.
- The first broad run had two stale Milestone 1 descriptor expectations, corrected before the final green run. It also reported a Vite watcher rejection after a completed page test; the standalone page test and final broad run passed without it.

## Regression Checks

- Existing middleware, auth, signed URL, operational HTTP, compiler discovery, and Vite page tests passed. The final Bun suite covered all package milestones.

## Expected Behavior

- Generated Bun HTTP routes and centralized middleware policy can attach `throttle:<policy>` after policy configuration. Identity keys use request context, limits return 429 with retry information, and backend failures follow the declared policy.

## Not Expected Yet

- Cross-process enforcement or Redis connectivity.

## Important Decisions

- Policies use epoch-aligned fixed windows and explicitly select identity and backend failure behavior.
- Backends own their clock and report retry duration as well as reset time.
- A malformed key callback result is an application error; only backend failures follow `onBackendError`.

## Architectural Issues

- None identified.

## Known Limitations

- Process-local backend quotas are not shared across processes.

## Blockers

- None.

## Next Work Within This Milestone

- None. Milestone 21 is next in `MILESTONES-v2.md`.
