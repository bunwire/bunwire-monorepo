# Middleware Redesign Milestone 12A — Core Managed Middleware Foundation

Status: Complete

## Packages Changed

- `packages/core`
- `tests`
- project progress and Core/test documentation

## Implemented

- Reviewed the authoritative architecture, middleware design, middleware milestones, and prior invocation/milestone records.
- Confirmed the pre-12A Core regression baseline passes: 7 files and 102 tests.
- Added the canonical `core.middleware` kind, `@Middleware()` decorator/type contract, immutable definitions/attachments, dedicated validation errors, generic chain executor, transient runtime-registry behavior, and the shared-scope around-invocation hook.
- Preserved historical callable plan middleware and callback-oriented `@Use()` unchanged as migration scaffolding.

## Remaining

- None.

## Acceptance Criteria

- [x] Middleware classes resolve through constructor DI from the invocation child container.
- [x] Two concurrent invocations receive different middleware instances.
- [x] Singleton dependencies injected into transient middleware retain singleton identity.
- [x] Middleware executes before/after the terminal continuation in declared order.
- [x] Middleware may short-circuit or transform the result.
- [x] `next()` may be called at most once.
- [x] Provider `boot()` and middleware share one invocation scope.
- [x] Core contains no adapter/platform concepts.

## Tests Added

- `tests/milestone-12a/core-managed-middleware.test.ts` — identity, counterfeit/malformed targets, immutable definitions/attachments, transient DI, singleton identity, concurrency, chain semantics, errors, repeated `next()`, shared Provider/Controller scope, and platform boundaries.

## Tests Run

- `pnpm.cmd --filter @bunwire/core test`
- `pnpm.cmd typecheck`
- `node_modules\\.bin\\vitest.cmd run tests/milestone-12a --reporter=verbose`
- `node_modules\\.bin\\vitest.cmd run tests/milestone-05 tests/milestone-10 tests/milestone-11 tests/milestone-12 tests/milestone-12a --reporter=dot`
- `pnpm.cmd quality`
- `pnpm.cmd test:clean-install`
- `pnpm.cmd test:electrobun-sdk-contract`
- `pnpm.cmd test:electrobun-native`
- built-output Core public-export smoke check with Node ESM
- `git -c safe.directory=D:/Projects/GitHub/bunwire/bunwire-monorepo diff --check`

## Test Results

- Passed: pre-implementation Core baseline, 7 files and 102 tests.
- Passed: workspace production and test typechecking.
- Passed: focused Milestone 12A suite, 1 file and 12 tests.
- Passed: Core regression suite with 12A, 8 files and 114 tests.
- Passed: affected Milestones 5, 10, 11, 12, and 12A regression slice, 6 files and 66 tests.
- Passed: full quality gate — Core package boundaries, production/test typechecking, pinned Electrobun SDK contract, 17 files and 207 tests, and all four workspace package builds.
- Passed: isolated frozen-lockfile clean install and complete workspace/test typechecking.
- Passed: explicit Electrobun 1.18.1 SDK compatibility check.
- Passed: real Electrobun Windows native-process request/message smoke with expected start, `native|sdk` result, completion markers, and clean exit.
- Passed: built Core entrypoint exposes the intentional managed middleware kind, decorator, definition/attachment helpers, executor, and dedicated errors.
- Passed: repository whitespace/error validation.
- Expected environment-only failures: initial sandboxed clean-install network access and native filesystem/process access were denied; approved unchanged reruns passed.
- Failed: none.
- Skipped: none.

## Regression Checks

- Existing callable middleware remains green at baseline.
- Milestones 0–12 remain green in the full 207-test suite.
- Existing callback `ManagedMethodMiddleware`, `@Use(exportedFunction)`, generated callback imports, and Electrobun normal/manual dispatch remain green and unchanged.
- Core boundary enforcement and targeted platform-reference scans pass.
- Runtime registry generation, generated client contracts, pinned SDK integration, example build, and real native host behavior remain green.

## Expected Behavior

After this milestone, Core can resolve and execute a prebuilt ordered list of canonical class middleware attachments around any terminal continuation in the same invocation scope as Provider boot and managed Controller dispatch.

## Not Expected Yet

- Compiler discovery or middleware metadata analysis.
- Class/string `@Use()` attachments.
- Application policy, groups, or controller mappings.
- Adapter filtering or Electrobun middleware integration.
- Removal of callback middleware.

## Important Decisions

- `Middleware` occupies the value namespace as the decorator and the type namespace as the generic contract.
- Canonical attachments contain a class `target` and frozen ordered string `parameters`.
- Core accepts adapter-supplied context creation and does not interpret filters, paths, transports, aliases, or groups.
- Canonical middleware definitions specialize the existing `RuntimeRegistry.classes` entry rather than introducing a parallel registry; middleware entries default to and require transient scope.
- `ManagedInvocationOptions.around` runs after Provider boot and wraps the terminal handler exactly once, allowing managed middleware and Controller dispatch to share the existing child scope.
- Canonical runtime identity requires both the registered `core.middleware` kind and own metadata from the exact Core `@Middleware()` decorator.

## Architectural Issues Encountered

- None. The existing managed-class registry, constructor metadata, child-container resolution, and invocation lifecycle supported the documented design without changing package ownership or adapter behavior.

## Deviations or Unresolved Questions

- None.

## Known Limitations

- Callback middleware remains temporary migration scaffolding until Milestone 12F.

## Blockers

- None.

## Next Work Within This Milestone

- None. Middleware Redesign Milestone 12B — Compiler Discovery and Metadata is next.
