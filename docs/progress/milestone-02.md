# Milestone 2 — Container, Bindings, Tokens, and Scopes

Status: Complete

## Packages Changed

- `packages/core`
- root test infrastructure

## Implemented

- Typed custom and class tokens.
- Class, singleton, transient, value, factory, alias, and existing-instance bindings.
- Indexed constructor metadata and recursive resolution.
- Per-container singleton caches, transient resolution, explicit overrides, and resolution errors.

## Remaining

- None.

## Acceptance Criteria

- [x] Custom tokens are unique even with equal descriptions.
- [x] Class constructors can act as runtime tokens.
- [x] Interface-only TypeScript types cannot accidentally become runtime tokens.
- [x] Zero-argument class resolves.
- [x] Constructor dependency index `0` resolves correctly.
- [x] Multiple constructor dependencies preserve positions.
- [x] Out-of-order dependency metadata creates correctly ordered arguments.
- [x] Singleton identity is stable within one container.
- [x] Separate root containers do not share singleton instances.
- [x] Transient bindings create a new instance per resolution.
- [x] Token-to-value binding works.
- [x] Token-to-factory binding works.
- [x] Token-to-class binding works.
- [x] Alias preserves singleton identity.
- [x] Missing tokens produce actionable errors.
- [x] Runtime circular dependencies report a useful resolution chain.

## Tests Added

- `tests/milestone-02/container.test.ts` — token, constructor-resolution, scope, binding, override, diagnostic, and type-level tests.

## Tests Run

- `pnpm typecheck`
- `pnpm test`
- `pnpm --filter @bunwire/core test`
- `pnpm test:clean-install`
- `pnpm quality`

## Test Results

- Passed: 20 container/DI tests in `tests/milestone-02/container.test.ts`.
- Passed: type-level interface-token assertion.
- Passed: Core package suite (28 tests across Milestones 1–2).
- Passed: Core build, dependent workspace builds, and platform-boundary scan.
- Failed: none in final verification.
- Skipped: none.

## Regression Checks

- Core build and dependent workspace builds.
- Core platform-boundary scan.

## Expected Behavior

- Explicit metadata and bindings construct recursive object graphs without source analysis.

## Not Expected Yet

- Automatic discovery, built-in managed-class registration, invocation scopes, or Application lifecycle.

## Important Decisions

- Bindings remain distinct from Providers.
- Last explicit binding wins and evicts stale singleton cache entries.
- All Milestone 2 test definitions live under `tests/milestone-02/`.

## Architectural Issues Encountered

- None.

## Deviations or Unresolved Questions

- Test placement is centralized under `tests/` at the user's explicit request; no unresolved questions remain.

## Known Limitations

- Invocation/child scopes are intentionally deferred.

## Blockers

- None.

## Next Work Within This Milestone

- None; milestone complete.
