# Milestone 4 — Application Builder, Provider Lifecycle, and Kernel

Status: Complete

## Packages Changed

- `packages/core`
- root test infrastructure
- Core documentation

## Implemented

- Authoritative startup, Provider lifecycle, precedence, invocation-scope, tests, and exit criteria reviewed.
- Public/runtime design established for Application state, Provider registries, convention registrations, and managed invocation boundaries.
- Container child scopes inherit root bindings/constructor metadata, share root singletons, and retain local overrides.
- `defineApp()` and the chainable Application configuration surface are implemented.
- Startup creates one root container, applies convention registrations, stores manual context, consumes/deduplicates Provider registries, and awaits `register()`.
- Managed invocation gating, `InvocationContext`, invocation-local configuration, Provider `boot()`, and child-container isolation are implemented.

## Remaining

- None.

## Acceptance Criteria

- [x] `defineApp()` returns a stable instantiated Application before startup.
- [x] Configuration is chainable without starting the Application.
- [x] `withContext()` stores context without starting the Application.
- [x] `start()` creates the root container exactly once.
- [x] Supplied context is root-container-accessible before Provider registration.
- [x] Provider registries are consumed and Providers follow the v1 construction rule.
- [x] `register(rootContainer)` runs exactly once per Provider during startup.
- [x] Explicit Provider bindings override convention defaults.
- [x] `InvocationContext` and child/invocation scope are available.
- [x] `boot(invocationContext)` runs once per Provider for each managed invocation.
- [x] Registration completes before managed invocations are accepted.
- [x] Concurrent invocation-scoped values remain isolated.
- [x] Service classes never receive Provider lifecycle calls.
- [x] Repeated/concurrent `start()` calls follow the documented clear-failure rule.

## Tests Added

- `tests/milestone-04/application-kernel.test.ts` — Application configuration/startup, Provider registry/lifecycle, constructor-policy, inherited-metadata rejection, runtime lifecycle validation, ordering/precedence, child-container, and synchronized concurrency coverage.

## Tests Run

- `pnpm typecheck`
- `node node_modules/vitest/vitest.mjs run tests/milestone-04 --reporter=verbose`
- `pnpm --filter @bunwire/core test`
- `pnpm test`
- `pnpm test:clean-install`
- `pnpm quality`
- built-output public-export smoke check with Node ESM
- `git diff --check`

## Test Results

- Passed: workspace production and test typechecking.
- Passed: finalized Milestone 4 suite, 1 file and 15 tests.
- Passed: Core package regression suite, 5 files and 54 tests.
- Passed: complete repository suite, 7 files and 64 tests.
- Passed: clean frozen-lockfile installation and workspace typecheck in an isolated temporary copy.
- Passed: full quality gate — package boundaries, production/test typechecking, 64 tests, and all four workspace package builds.
- Passed: built Core entrypoint loads the Application and Provider-registry public exports.
- Passed: repository diff whitespace/error check.
- Failed in final verification: none.
- Skipped: none.

## Corrective Verification — 2026-08-20

- Undecorated subclasses of decorated Providers are rejected by registry validation.
- Constructed runtime Provider entries must expose a callable `register(container)` hook and receive an actionable diagnostic otherwise.
- Passed: finalized Milestone 4 suite, 1 file and 19 tests.
- Passed: focused Milestones 1, 3, and 4 suite, 4 files and 40 tests.
- Passed: full repository suite, 7 files and 70 tests.
- Passed: package boundaries, production/test typechecking, all workspace builds, and clean frozen-lockfile installation/typechecking.
- Failed: none.

## Regression Checks

- Milestones 0–3 pass alongside Milestone 4.
- Core contains no platform imports and passes package-boundary enforcement.
- All test definitions remain centralized beneath `tests/`.
- Core, Vite, Electrobun, and the Electrobun example build successfully.
- Frozen-lockfile clean installation and test/production typechecking pass.

## Expected Behavior

After this milestone:

- Applications can be configured while unstarted and enter a running state only through `app.start()`.
- Provider registration runs once against the root container after manual context is stored.
- Each managed invocation receives an isolated child container and runs Provider boot hooks before its handler.

## Not Expected Yet

- Managed-method metadata/plans, adapter host startup, compiler discovery, generated registries, or shutdown/disposal APIs.

## Important Decisions

- A second or concurrent `start()` call fails clearly; startup is never silently repeated.
- Convention/default registrations run before Provider registration so the container's documented last-binding-wins behavior gives explicit Provider bindings precedence.
- Duplicate Provider classes contributed by registries are deduplicated by class identity.
- Managed invocations are accepted only in the running state, after every asynchronous `register()` has completed.
- Provider construction supplies zero arguments and does not use container DI, consistent with Milestone 3.

## Architectural Issues Encountered

- The milestone flow diagram places convention bindings after Provider registration while registration precedence requires Provider bindings to win. The architecture explicitly permits different staging when deterministic explicit precedence is preserved, so conventions will be staged first.
- Provider registry validation inherited the managed-metadata ownership defect and could accept an undecorated subclass of a decorated Provider. Constructor-local metadata lookup and registry regressions now prevent this.

## Deviations or Unresolved Questions

- None.

## Known Limitations

- Shutdown/disposal is not introduced because Milestone 4 requires it only if needed; no owned disposable resources exist yet.

## Blockers

- None.

## Next Work Within This Milestone

- None. Milestone 4 is complete; Milestone 5 is next.
