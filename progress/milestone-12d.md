# Middleware Redesign Milestone 12D — Application Policy, Groups, and Normalization

Status: Complete

## Packages Changed

- `packages/core`
- `packages/vite`
- `tests`
- project progress and package/test documentation

## Implemented

- Added the compiler-only Core `MiddlewarePolicyRegistry` contract and single-use `Application.withMiddlewares()` composition boundary; callbacks are validated but never retained or invoked.
- Shared the direct exported-Application-chain parser between adapter and middleware policy discovery and included the bootstrap in the TypeScript Program without adding it to managed discovery.
- Added strict static parsing for direct `use`, `group`, and `controllers` statements and dedicated policy diagnostics.
- Added forward/nested group expansion, alias collision checks, parameter restrictions, and complete cycle-path diagnostics.
- Added case-sensitive POSIX-normalized Controller pattern matching across configured source roots with `*`/`**`, validation, and unmatched-pattern failures.
- Normalized every method as global → mapped Controller → Controller local → method local and deduplicated only exact canonical attachments at their earliest occurrence.
- Changed generation to emit the final analyzed method pipeline directly, with no unresolved policy data.
- Preserved ordered callback migration entries without deduplicating or executing managed attachments.

## Remaining

- None.

## Acceptance Criteria

- [x] One static `withMiddlewares()` block compiles without executing application code.
- [x] Runtime composition and manual/prebuilt registries never interpret the policy callback.
- [x] Globals, nested groups, and Controller mappings resolve deterministically.
- [x] Invalid DSL, names, collisions, unknown references, and complete group cycles fail clearly.
- [x] Controller patterns match normalized configured-root-relative paths and unmatched patterns fail.
- [x] Final order is global → mapped Controller → Controller `@Use()` → method `@Use()`.
- [x] Exact canonical attachments deduplicate at their earliest occurrence while distinct parameters remain.
- [x] Generated plans contain no unresolved groups, aliases, patterns, or policy objects.

## Tests Added

- `tests/milestone-12d/core-middleware-policy.test.ts` — runtime single-call/no-execution and prebuilt-registry authority.
- `tests/milestone-12d/middleware-policy.test.ts` — group expansion, four-scope order, deduplication, multi-root patterns, deterministic/type-correct/runtime-loaded generation, and analysis-only behavior.
- `tests/milestone-12d/middleware-policy-invalid.test.ts` — callback and forbidden-statement diagnostics.
- `tests/milestone-12d/middleware-policy-reference-invalid.test.ts` — dynamic and counterfeit reference diagnostics.
- `tests/milestone-12d/middleware-policy-group-invalid.test.ts` — names, collisions, unknown references, parameter restrictions, and complete cycle paths.
- `tests/milestone-12d/middleware-policy-mapping-invalid.test.ts` — mapping syntax plus invalid/unmatched Controller patterns.
- `tests/milestone-12d/policy-test-support.ts` — isolated compiler fixture harness shared by the diagnostic files.
- `tests/fixtures/milestone-12d-policy` — valid and deliberately throwing analysis-only source universes.

## Tests Run

- `pnpm.cmd typecheck`
- `.\\node_modules\\.bin\\vitest.CMD run --config vitest.config.ts tests/milestone-12d`
- `.\\node_modules\\.bin\\vitest.CMD run --config vitest.config.ts tests/milestone-12c`
- `pnpm.cmd --filter @bunwire/core test`
- `pnpm.cmd --filter @bunwire/vite test`
- `pnpm.cmd quality`
- `pnpm.cmd install --frozen-lockfile`
- `pnpm.cmd test:clean-install`
- `pnpm.cmd test:electrobun-native`
- built Core and Vite ESM public-export smoke commands
- `git -c safe.directory=D:/Projects/GitHub/bunwire/bunwire-monorepo diff --check`

## Test Results

- Final focused 12D suite: 6 files passed, 41 tests passed, 0 failed.
- Complete Core package suite: 10 files passed, 121 tests passed, 0 failed.
- Complete final Vite package suite: 14 files passed, 156 tests passed, 0 failed.
- 12C regression suite after final normalization: 3 files passed, 30 tests passed, 0 failed.
- Final `pnpm quality`: boundaries passed; workspace typecheck passed; Electrobun 1.18.1 SDK contract passed; 29 files/311 tests passed; all four buildable workspace packages passed.
- Normal frozen-lockfile install: passed and already up to date.
- Isolated clean frozen-lockfile install and workspace typecheck: passed.
- Native Electrobun process smoke: passed all start, request, and completion markers.
- Built Core/Vite public-export checks: passed, including runtime proof that `withMiddlewares()` does not execute its callback.
- Generated-output determinism/semantic/runtime loading: passed in focused and full suites.
- Final `git diff --check`: passed (only platform line-ending notices).
- The first sandboxed clean-install attempt was denied registry access and the first sandboxed native smoke could not traverse the installed Electrobun package; both passed unchanged when rerun with the required external access.

## Regression Checks

- Milestones 4 and 5 passed through the Core suite and final repository suite.
- Milestones 7–10 and Middleware Redesign 12B–12D passed through the Vite suite and final repository suite.
- Milestones 11 and 12, including generated clients, normal/manual host behavior, SDK integration, and native-process dispatch, passed in the final repository/native gates.
- Historical callback middleware remains green and ordered; managed attachments remain inert until 12E.

## Expected Behavior

After this milestone, every generated managed method carries its complete canonical middleware policy before runtime starts.

## Not Expected Yet

- Adapter filter interpretation or native middleware execution.
- Electrobun middleware contexts.
- Removal of callback migration scaffolding.

## Important Decisions

- `AnalyzedManagedMethod.middleware` becomes the final normalized pipeline and the generator emits it directly.
- Policy compilation is AST/type-checker only and never invokes the runtime configuration callback.

## Architectural Issues Encountered

- None.

## Deviations or Unresolved Questions

- None.

## Known Limitations

- Middleware execution remains deferred to Milestone 12E.

## Blockers

- None.

## Milestone 12F Reconciliation

Milestone 12F removed the callback normalization exception. Final pipelines deduplicate and emit only canonical managed attachments; all policy and group regressions pass.

## Next Work Within This Milestone

- None. Middleware Redesign Milestone 12E is next.

## Post-Review Corrections — 2026-08-24

- Closed the static-policy fail-open gap by rejecting every element-access call in the exported Application chain, including identifier and template-literal keys that resolve to `withMiddlewares`.
- Added compiler regressions proving computed policy access fails with `MIDDLEWARE_POLICY_INVALID` instead of silently producing an empty policy.
- The final Vite package suite passed 15 files and 161 tests.
