# Milestone 1 — Managed-Class Metadata and Decorator Definitions

Status: Complete

## Packages Changed

- `packages/core`
- root test infrastructure

## Implemented

- Namespaced class-kind and decorator identifiers.
- Immutable generic `ManagedClassKind` descriptors.
- Managed-class decorator helper and source-independent runtime metadata.
- Public Core extension exports.

## Remaining

- None.

## Acceptance Criteria

- [x] Two class kinds coexist without enum changes.
- [x] Class-kind IDs are stable and namespaced.
- [x] `injectable` is independent from `managedMethods`.
- [x] Registry-managed but non-method-managed kinds are supported.
- [x] Adapter descriptors compile through public Core APIs.
- [x] Core contains no adapter-specific class-kind IDs.

## Tests Added

- `tests/milestone-01/managed-classes.test.ts` — generic class-kind/decorator tests and type-level invalid-ID assertion.
- `tests/milestone-01/public-api.test.ts` — external public-API fixture compilation and production-ID scan.
- `tests/fixtures/milestone-1-adapter` — external adapter compile fixture.

## Tests Run

- `pnpm typecheck`
- `pnpm test`
- `pnpm --filter @bunwire/core test`
- `pnpm test:clean-install`
- `pnpm quality`

## Test Results

- Passed: 6 managed-class tests in `tests/milestone-01/managed-classes.test.ts`.
- Passed: 2 public-extension tests in `tests/milestone-01/public-api.test.ts`.
- Passed: external adapter fixture compilation through public `@bunwire/core`.
- Passed: type-level assertions, Core build, dependent workspace builds, and package-boundary scan.
- Failed: none in final verification.
- Skipped: none.

## Regression Checks

- Core build and dependent workspace builds.
- Core package-boundary scan.

## Expected Behavior

- Core represents built-in-like and adapter-defined managed class kinds through one generic model.

## Not Expected Yet

- Built-in Service, Controller, and Provider kinds.

## Important Decisions

- Tests import the public `@bunwire/core` entrypoint through test-only path mapping rather than internal source paths.
- All Milestone 1 test definitions live under `tests/milestone-01/`.

## Architectural Issues Encountered

- None.

## Deviations or Unresolved Questions

- Test placement is centralized under `tests/` at the user's explicit request; no unresolved questions remain.

## Known Limitations

- Built-in kinds remain Milestone 3 work.

## Blockers

- None.

## Next Work Within This Milestone

- None; milestone complete.
