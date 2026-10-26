# Milestone 21 — Dependency Invalidation and Diagnostic Integration

Status: Complete

## Packages Changed

- `@bunwire/vite` analysis, Vite integration, and compiler diagnostics.

## Implemented

- Began from the completed Milestone 20 static-composition baseline.
- Compiler analysis and manual generation now return sorted project-local consumed dependency paths; opaque external package references are excluded from the watch graph.
- Vite registers consumed inputs, includes external managed-root dependency parent directories for deletion recovery, refreshes the relevance set after analysis, and invalidates virtual modules even when refresh fails.
- Compiler errors now support structured related locations; static expression chains, helper call stacks, loop iterations, and deferred middleware normalization carry them while preserving primary codes/messages.
- Schedule validation also preserves helper/loop context and related locations after expansion.
- Added real Vite dependency and structured diagnostic fixture tests, including schedule validation and paths with spaces.
- Updated the compiler and architecture guides and the release declaration allowlist for the new related-location type.

## Remaining

- None for Milestone 21. The broader cross-package release checkpoint belongs to Milestone 22.

## Acceptance Criteria

- [x] Every supported source relationship participates in invalidation and recovery.
- [x] Compiler errors remain actionable across file and helper boundaries.
- [x] Manual and Vite paths agree on records and diagnostics.
- [x] Required real watcher and regression checks pass and are recorded.

## Tests Added / Tests Run / Test Results

- `tests/milestone-21/dependency-watching.test.ts`: real Vite and manual generation parity, external imported constants/helpers/barrels, changed dependency sets, deletion/recovery, discovery boundary, stable bytes, and no generated feedback.
- `tests/milestone-21/related-diagnostics.test.ts`: imported expression declaration/reference, nested helper definition/call, delayed middleware and schedule loop validation, and paths containing spaces.
- Initial `tests/milestone-21/related-diagnostics.test.ts`: **3 passed, 0 failed**.
- Expanded diagnostic rerun after schedule coverage: **4 passed, 0 failed**.
- Initial real Vite dependency run: **2 test assertions passed**, but Vitest reported **5 unhandled watcher rejections** during intentional deletion and teardown. The plugin now reports development refresh errors through Vite and drains pending refreshes at server close.
- Real Vite dependency rerun after error handling: **2 passed, 0 unhandled errors**.
- Expanded real Vite dependency run with manual-failure and stable-output assertions: **2 passed, 0 unhandled errors**.
- Expanded structured diagnostics with schedule validation: **4 passed, 0 failed**.
- Source TypeScript typecheck after dependency/watch changes: passed. Root typecheck after schedule metadata initially found one `exactOptionalPropertyTypes` error in the new optional `related` field; corrected before the regression checkpoint.
- `pnpm typecheck`: passed after that correction, including the tests project.
- `pnpm check:boundaries`: passed; release package boundaries valid.
- `pnpm build`: passed across workspace packages and examples.
- First `pnpm test:built-exports`: failed only because the new public `BunwireRelatedLocation` type was absent from the committed declaration allowlist. The allowlist was updated; rerun passed for all release packages.
- `pnpm --filter @bunwire/vite test`: **26 files, 389 tests passed, 0 failed**, including Milestone 21's real Vite and structured diagnostic fixtures and the prior config/bootstrap/source/page watcher regression.
- After adding the static declaration to related locations, `pnpm exec vitest run tests/milestone-15/static-expression.test.ts tests/milestone-21/related-diagnostics.test.ts --reporter=dot`: **2 files, 58 tests passed, 0 failed**. The 389 previously passing tests were not repeated because the final change only adds declaration metadata to error objects.
- `pnpm typecheck`: passed again after that final diagnostic change; `pnpm --filter @bunwire/vite build`: passed.

## Important Decisions / Architectural Issues

- Dependency files remain compilation inputs, not managed-class discovery roots.
- A failed refresh retains last-successful dependency watch coverage for restoration, invalidates stale virtual modules, and reports the error. Physical artifacts are not claimed as newly generated on failure.
- Static references, active declarations, reached helper definitions/calls, and loop iteration sites are represented by labeled related locations without replacing the primary location or existing message path.

## Expected Behavior / Not Expected Yet

- Expected: imported static values and helpers refresh generated metadata during Vite development; manual generation uses the same dependency graph. Editing a no-longer-consumed dependency does not regenerate artifacts. Deleting a consumed dependency raises an error without rewriting successful artifacts, and restoring it recovers in the same Vite process.
- Not expected: the broader cross-package release verification assigned to Milestone 22.

## Regression Checks / Known Limitations / Blockers

- The full `@bunwire/vite` package test suite, root typecheck, workspace build, package boundaries, and built exports passed. No blocker is known.
- Development dependencies remain project-local. Arbitrary dependency-package source and general JavaScript execution are still excluded.

## Next

- Project Milestone 22: cross-package hardening and final release verification.
