# Milestone 20 — Bounded Static `for...of` Expansion

Status: Complete

## Packages Changed

- `@bunwire/vite` static policy expansion, focused compiler fixtures/tests, and current architecture/compiler documentation.

## Implemented

- Began from the completed Milestone 19 repeated-policy composition baseline.
- Shared statement walker now expands supported `for...of` in callbacks and helpers with fresh per-iteration bindings, nested loops, source order, and shared depth/node charging.
- Unsupported loop forms and control flow receive explicit diagnostics; loop errors include the source location and iteration path.
- Added 31 compiler, generated-output, budget, and runtime tests covering canonical middleware/job targets, imported arrays, lexical scope, nested helpers, generated equivalence, no source execution, and Bun/Electrobun/generic runtime behavior.
- Preserved Milestone 18 unsupported-statement diagnostic wording while identifying bounded loops and unsupported conditional control flow.
- Updated the compiler and architecture guides, including the stale statement that repeated blocks were deferred.

## Remaining

- None for Milestone 20. Dependency invalidation and structured related locations are assigned to Milestone 21.

## Acceptance Criteria

- [x] Supported loops work in both callbacks and helper bodies.
- [x] Empty and nested loops behave predictably within fixed budgets.
- [x] Overflow and unsupported loops produce actionable diagnostics without successful partial output.
- [x] Required tests pass and results are recorded.

## Tests Added / Tests Run / Test Results

- `tests/milestone-20/policy-loops.test.ts`: direct run **1 file, 27 tests passed, 0 failed** (`.cache/milestone-20-behavior-initial.json`).
- `pnpm exec tsc -p packages/vite/tsconfig.json --noEmit --pretty false`: passed after AST narrowing corrections.
- `tests/milestone-20/policy-loop-budgets.test.ts`: initial run had 3 passed and 1 failed because the 10,001st declaration error lacked its loop path. After carrying loop provenance to middleware normalization, the focused rerun passed **1 file, 4 tests passed, 0 failed** (`.cache/milestone-20-budgets-recheck.json`).
- `pnpm exec tsc -p packages/vite/tsconfig.json --noEmit --pretty false`: passed again after the provenance fix.
- `pnpm exec vitest run tests/milestone-20 --reporter=dot --reporter=json --outputFile=.cache/milestone-20-final.json`: **2 files, 31 tests passed, 0 failed** after the provenance fix.
- `git diff --check`: passed with line-ending conversion notices only.
- `pnpm typecheck`: passed, including the root test TypeScript project.
- `pnpm check:boundaries`: passed; release package boundaries valid.
- `pnpm build`: passed across all workspace packages and both examples.
- `pnpm test:built-exports`: passed; runtime and declaration export allowlists valid.
- First `pnpm --filter @bunwire/vite test` regression checkpoint: **24 files, 381 passed, 2 failed**. Both failures were Milestone 18 assertions for the old unsupported-statement message fragment; behavior and error codes remained correct. The message now retains that fragment while naming bounded loops.
- `pnpm exec vitest run tests/milestone-18/policy-helpers.test.ts tests/milestone-20/policy-loops.test.ts -t 'rejects unsupported middleware helper|rejects unsupported loop form' --reporter=dot`: **2 files, 28 passed, 39 intentionally skipped by the name filter, 0 failed**. Includes both prior failures and all directly affected M20 unsupported-loop messages.
- `pnpm --filter @bunwire/vite build`: passed after the diagnostic text correction.

## Important Decisions

- Reuse the Milestone 18 shared helper walker and Milestone 15 static-expression session. Each loop iteration gets a distinct lexical binding frame.
- Existing policy consumers continue to count declarations before deduplication; expansion work shares the fixed node/depth budgets.

## Architectural Issues / Deviations

- Middleware global attachments are counted after static expansion, so a loop budget failure cannot rely on the active walker stack. Carry the loop path with resolved policy values until normalization and preserve the original source location.

## Expected Behavior / Not Expected Yet

- Expected: static known-array iteration composes middleware and schedules without executing application code. Empty arrays emit nothing; nested iterations preserve source order and lexical values. Overflow aborts analysis with source and iteration path.
- Not expected: general JavaScript control flow or complete imported-dependency watcher integration.

## Regression Checks

- Final `@bunwire/vite` package suite covered earlier policy, compiler, and generated-output behavior affected by the shared walker and provenance changes: 381 passed initially. Its two message compatibility failures passed on the targeted rerun; the 381 previously passing tests were not repeated because the correction changed only diagnostic wording.
- Milestone 20's 31 direct tests passed after the provenance correction, including real Bun scheduling and Electrobun/generic invocation.

## Known Limitations / Blockers

- None.

## Next

- Project Milestone 21: dependency invalidation, watcher recovery, and structured related diagnostic locations.
