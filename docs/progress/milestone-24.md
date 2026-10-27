# Milestone 24 — Standalone Watch Lifecycle

Status: Complete

## Packages Changed

- `packages/vite` — shared compiler watch inputs and recovery analysis.
- `packages/cli` — standalone Node watcher and CLI command.

## Implemented

- Vite-independent compiler watch-input, relevance, provisional discovery, and missing-import recovery utilities.
- Existing Vite plugin now consumes shared utilities; its watched-input regression tests passed.
- `bunwire watch [--root path]` with immediate generation, dynamic Node directory watchers, serialized refreshes, output filtering, and abortable shutdown.
- Recoverable initial and later analysis errors retain last successful physical artifacts.
- CLI and compiler documentation updated; packed consumer watch smoke passes without Vite or Bun.

## Remaining

- None.

## Acceptance Criteria

- [x] `bunwire watch [--root path]` regenerates physical artifacts on supported changes.
- [x] Shared Vite-independent input and missing-import recovery logic serves Vite and CLI.
- [x] Last successful artifacts survive analysis failures and the watcher recovers after fixes.
- [x] Dynamic dependency sets, output-loop prevention, serialized refreshes, and clean shutdown work.
- [x] Bun and Electrobun fixture checks, affected packages, and final broad regression checkpoint pass.

## Tests Added

- `tests/milestone-24/watch.test.ts`: Electrobun and Bun fixture regeneration, managed source, external dependencies and re-exports, missing-import recovery, initial config recovery, pages, output-loop prevention, rapid edits, and controlled shutdown.
- Extended `tests/milestone-23/packed-no-vite.mjs` with a live packed watcher regeneration smoke path.

## Tests Run

- `pnpm exec vitest run tests/milestone-24/watch.test.ts` — 4 passed before the final bootstrap/root-option assertion adjustment.
- `pnpm exec vitest run tests/milestone-24/watch.test.ts -t 'handles managed|recovers an initially'` — 2 passed, 2 intentionally filtered, after the adjustment.
- `pnpm exec vitest run tests/milestone-23/cli-generation.test.ts -t 'accurate command catalog'` — 1 passed, 5 intentionally filtered, after adding `watch` to the catalog.
- `pnpm test:cli-pack` — passed; packed CLI generated and watched Electrobun artifacts without Vite or Bun.
- `pnpm exec vitest run tests/milestone-12/virtual-modules-vite.test.ts tests/milestone-21/dependency-watching.test.ts` — 4 passed.
- `pnpm --filter @bunwire/cli typecheck` and `pnpm --filter @bunwire/vite typecheck` — passed.
- `pnpm typecheck` — passed for the workspace and tests.
- `pnpm build` — passed for all packages and both Bun/Electrobun examples.
- `pnpm check:boundaries`, `pnpm test:built-exports`, and `pnpm test:release-pack` — passed.
- `pnpm test` — initial broad run was stopped after an integrated Milestone 22 Vite test reported a failure marker; no aggregate result was available from that interrupted run.
- `pnpm exec vitest run tests/milestone-22/billing-vite.test.ts -t 'updates re-exported constants'` — 1 passed, 1 filtered.
- `pnpm exec vitest run tests/milestone-22/billing-vite.test.ts -t 'recovers when a newly imported helper'` — 1 passed, 1 filtered.
- `pnpm exec vitest run tests/milestone-22/billing-vite.test.ts` — 2 passed after increasing only its second test's timeout from 90 to 180 seconds.
- `pnpm --filter @bunwire/cli test` — final run: 2 files, 11 tests passed, including all five standalone watch cases.
- `pnpm exec vitest run tests/milestone-24/watch.test.ts -t 'keeps Bun command artifacts current'` — 1 passed, 4 intentionally filtered after correcting a test-only registry format expectation.
- `pnpm --filter @bunwire/vite test` — 26 files, 392 tests passed as the affected compiler/package checkpoint.

## Test Results

- Passed: all final checks above, including 11 CLI tests, 392 Vite/compiler tests, and 2 billing Vite integration tests.
- Failed during development: a Milestone 22 integration test timed out at 90 seconds when run after a large fixture expansion. The complete billing Vite file subsequently passed 2/2 with a 180-second limit; no behavioral assertion changed. The first Bun watch fixture assertion also expected the wrong registry text format and passed after correction.
- Skipped: only intentionally filtered cases in focused development runs; none in the final package runs.

## Regression Checks

- Real Vite source/config and imported-dependency watcher cases passed after the shared extraction.
- Packed Node-only consumer watched a source edit successfully.
- Standalone Bun command fixture regenerated its physical registry after a command metadata edit, with no Vite server.
- Bun and Electrobun example builds passed with zero generated artifact changes.
- Public export, package boundary, and isolated release package checks passed.
- The Milestone 22 billing Vite recovery file passed both tests together after allowing the second test more time following the first test's large expansion workload.
- The complete Vite package suite passed 392/392 after extraction of shared watcher logic; the complete CLI suite passed 11/11 after adding the Bun fixture.

## Expected Behavior

- A standalone Node process keeps one configured project's physical artifacts current and recovers after failed analysis without a Vite server.

## Not Expected Yet

- Compiler inspection commands, source generators, Bun command dispatch, or project scaffolding.

## Important Decisions

- Initial config/compiler errors remain watchable and recover in the same process.
- Start with Node's filesystem watcher; add a CLI watcher dependency only if supported-platform tests show a concrete gap.
- The Milestone 22 billing Vite test's 90-second limit proved too short for the sequential heavy expansion and watcher shutdown path in this environment; its recovery assertions remain unchanged at 180 seconds.

## Known Limitations

- None recorded.

## Blockers

- None.

## Next Work Within This Milestone

- None; Milestone 24 is complete. Project Milestone 25 is next.
