# Middleware Redesign Milestone 12B — Compiler Discovery and Metadata

Status: Complete

## Packages Changed

- `packages/vite`
- `tests`
- project progress and Vite/test documentation

## Implemented

- Reviewed the authoritative 12B requirements against the completed 12A Core contracts and existing compiler/generator extension points.
- Confirmed the starting worktree contains only the completed, verified 12A changes.
- Registered Core middleware with canonical compiler extension aggregation and exact-symbol authorization.
- Added middleware class/export/handler validation, literal intrinsic metadata extraction, duplicate alias detection, and existing constructor/cycle analysis integration.
- Added conditional deterministic `defineMiddlewareDefinition()` generation and verified the generated registry through Core's 12A runtime boundary.

## Remaining

- None.

## Acceptance Criteria

- [x] Canonical, aliased, and re-exported `@Middleware()` symbols are recognized.
- [x] Same-ID counterfeit symbols are rejected.
- [x] Middleware classes must be named, directly exported, concrete, and provide or inherit a concrete callable instance `handle()`.
- [x] Supported protected literal metadata is preserved and emitted deterministically with canonical transient scope.
- [x] Dynamic/non-literal metadata and forbidden member forms fail with source-located middleware diagnostics.
- [x] `only` plus `except` fails compilation.
- [x] Duplicate filter values and duplicate aliases fail deterministically.
- [x] Constructor DI, inherited-constructor safeguards, and cycle validation match other injectable managed classes.
- [x] Compiler analysis and generation never import, construct, initialize, or invoke middleware.
- [x] Generated definitions pass semantic TypeScript checking and load through the 12A Core validation boundary.
- [x] Historical callback middleware output remains compatible and no 12C-or-later behavior was added.

## Tests Added

- `tests/milestone-12b/middleware-compiler.test.ts` — canonical discovery, literal metadata, counterfeit identity, deterministic generation, semantic typechecking, and runtime registry loading.
- `tests/milestone-12b/middleware-metadata-invalid.test.ts` — exhaustive intrinsic metadata and duplicate-alias diagnostics.
- `tests/milestone-12b/middleware-class-invalid.test.ts` — class/handler shape, constructor DI, inherited constructor, cycle, and no-execution diagnostics.
- `tests/fixtures/milestone-12b-middleware` — valid and adversarial compiler source universe.

## Tests Run

- `pnpm.cmd typecheck`
- `node_modules\\.bin\\vitest.cmd run tests/milestone-12b --reporter=dot`
- `pnpm.cmd --filter @bunwire/core test -- --reporter=dot`
- `pnpm.cmd --filter @bunwire/vite test -- --reporter=dot`
- `node_modules\\.bin\\vitest.cmd run tests/milestone-07/compiler-discovery.test.ts --reporter=dot`
- `pnpm.cmd quality`
- `pnpm.cmd test:clean-install`
- `pnpm.cmd test:electrobun-native`
- built Core/Vite public-export import smoke
- `git diff --check`

## Test Results

- Passed: workspace production and test typechecking.
- Passed: focused Milestone 12B suite, 3 files and 33 tests.
- Passed: complete Core package suite, 8 files and 114 tests.
- Passed: complete Vite package test set after updating the canonical seeded-kind expectation, 7 files and 92 tests.
- Passed: focused Milestone 7 compatibility rerun, 1 file and 22 tests.
- Passed: `pnpm quality`, including boundaries, workspace typechecking, Electrobun 1.18.1 SDK compatibility, all 20 repository test files and 240 tests, and all workspace builds.
- Passed: clean frozen-lockfile install and workspace typecheck.
- Passed: real Electrobun native-process request/response smoke.
- Passed: built Core/Vite public-export import smoke.
- Passed: final generated-output stability coverage and `git diff --check`.
- Passed after the final import-allocation stability correction: Milestone 10 plus 12B generator/compiler regressions, 4 files and 45 tests, followed by workspace typechecking.
- Corrected test-runner issue: the first one-file focused runs passed every assertion but exceeded Vitest's worker task-update window; splitting the same cases into three focused files passes without runner errors.
- Corrected verification command issue: the first built-export smoke compared the kind definition object directly to its string ID; the corrected public-contract check uses `MIDDLEWARE_KIND.id` and passes.
- Environment note: the first clean-install attempt was blocked by sandboxed npm-registry access; the identical command passed outside that restriction.
- Failed after correction: none.
- Skipped: none.

## Regression Checks

- Milestones 7–10 compiler discovery, symbol/constructor analysis, method plans, and generated registry behavior pass.
- Milestone 11 Electrobun compiler/runtime integration and platform-boundary checks pass.
- Milestone 12 generated clients and callback `@Use()` middleware pass unchanged.
- Milestone 12A Core managed middleware runtime behavior passes unchanged.
- Non-middleware deterministic registry generation remains covered by the byte-stability regression suite.
- Regenerating the middleware-free Electrobun example produces no registry diff, proving 12B does not renumber or rewrite non-middleware output.

## Expected Behavior

After this milestone, the compiler emits deterministic, type-correct transient middleware definitions containing canonical class identity, literal metadata, and indexed constructor dependencies without executing application middleware code.

## Not Expected Yet

- Class/string `@Use()` attachments.
- Groups, global stacks, centralized policy, or controller mappings.
- Adapter filtering, context construction, or Electrobun middleware execution.
- Removal of callback middleware.

## Important Decisions

- Compiled middleware metadata remains in `AnalyzedManagedClass.data` as `MiddlewareClassMetadata`.
- Generated middleware class records use the 12A `defineMiddlewareDefinition()` boundary and remain in `RuntimeRegistry.classes`.
- Inherited concrete instance `handle()` implementations are valid; abstract, static, declaration-only, and missing handlers are invalid.
- Import allocation retains the pre-12B order for ordinary managed classes; middleware-specific helper/dependency allocation is isolated to middleware records.

## Architectural Issues Encountered

- None.

## Deviations or Unresolved Questions

- None.

## Known Limitations

- Middleware attachments and runtime adapter matching remain deferred to later redesign milestones.

## Blockers

- None.

## Milestone 12F Reconciliation

Milestone 12F removed compiler callback analysis and generation. Middleware discovery/metadata now feeds attachment-only generated pipelines; the complete Vite suite and repository quality gate passed.

## Next Work Within This Milestone

- None. Milestone 12C — Local Middleware Attachments is next.
