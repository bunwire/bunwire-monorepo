# Milestone 0 — Monorepo and Quality Foundation

Status: Complete

## Packages Changed

- workspace/root tooling
- `packages/core`
- `packages/vite`
- `packages/electrobun`
- `examples/electrobun-app`

## Implemented

- pnpm workspace and package entrypoints.
- Strict TypeScript project references and package build scripts.
- Vitest configuration, compiler-fixture infrastructure, forbidden-import checks, and CI quality workflow.
- Isolated frozen-lockfile clean-install/typecheck automation.

## Remaining

- None.

## Acceptance Criteria

- [x] Core builds without Vite installed as a runtime dependency.
- [x] Core builds without Electrobun installed as a runtime dependency.
- [x] Deliberate `core -> vite` import fails the architecture test.
- [x] Deliberate `core -> electrobun` import fails the architecture test.
- [x] Workspace typecheck succeeds from a clean install.
- [x] Workspace tests run from the root.
- [x] Packages build independently.

## Tests Added

- `tests/milestone-00/foundation.test.ts` — isolated Core builds, root runner, and independent package builds.
- `tests/milestone-00/architecture.test.ts` — forbidden-import architecture tests.
- `tests/clean-install.mjs` — temporary-workspace frozen-lockfile install/typecheck test.

## Tests Run

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:architecture`
- `pnpm --filter @bunwire/core test`
- `pnpm test:clean-install`
- `pnpm quality`

## Test Results

- Passed: root Vitest suite, 5 files and 38 tests.
- Passed: focused architecture suite, 1 file and 3 tests.
- Passed: Core package suite, 3 files and 28 tests.
- Passed: isolated clean frozen-lockfile install plus production/test typechecks.
- Passed: boundary scan, workspace typecheck, and all four package builds through `pnpm quality`.
- Failed: none in final verification.
- Skipped: none.

## Regression Checks

- Core, Vite, Electrobun, and example package builds.
- Core forbidden-import source scan.

## Expected Behavior

- Workspace package boundaries and quality gates are mechanically enforced.

## Not Expected Yet

- Compiler, adapter, or application runtime behavior.

## Important Decisions

- All tests are centralized under root `tests/` at the user's request.
- Networked/destructive clean-install verification lives at `tests/clean-install.mjs` and is also run by CI.

## Architectural Issues Encountered

- None.

## Deviations or Unresolved Questions

- Test placement is centralized under `tests/` at the user's explicit request; no unresolved questions remain.

## Known Limitations

- None within Milestone 0 scope.

## Blockers

- None.

## Next Work Within This Milestone

- None; milestone complete.
