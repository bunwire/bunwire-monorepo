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
- `tests/milestone-03/built-in-kinds.test.ts` — cross-milestone regression coverage proving managed metadata is constructor-local across inheritance and subclasses can opt in independently.

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

## Corrective Verification — 2026-08-20

- Corrected metadata lookup to require an own metadata property on the requested constructor.
- Passed: focused Milestones 1, 3, and 4 suite, 4 files and 40 tests.
- Passed: full repository suite, 7 files and 70 tests.
- Passed: package boundaries, production/test typechecking, all workspace builds, and clean frozen-lockfile installation/typechecking.
- Failed: none.

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

- Runtime metadata lookup initially used ordinary static-property access, allowing undecorated subclasses to inherit a decorated base class's managed identity. Corrected by requiring constructor-owned metadata and covered by inheritance regressions.

## Deviations or Unresolved Questions

- Test placement is centralized under `tests/` at the user's explicit request; no unresolved questions remain.

## Known Limitations

- Built-in kinds remain Milestone 3 work.

## Blockers

- None.

## Next Work Within This Milestone

- None; milestone complete.
