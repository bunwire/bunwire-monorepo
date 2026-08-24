# Milestone 3 — Built-in Service, Controller, and Provider Kinds

Status: Complete

## Packages Changed

- `packages/core`
- root test infrastructure
- architecture documentation

## Implemented

- Authoritative architecture, requirements, tests, and exit criteria reviewed.
- V1 Provider construction rule decided: Bunwire supplies zero constructor arguments and performs no Provider constructor DI.
- Generic managed-class decorators now support reusable target validation.
- `SERVICE_KIND`, `CONTROLLER_KIND`, and `PROVIDER_KIND` are defined through `defineClassKind()`.
- `Service`, `Controller`, and `Provider` are defined through `defineManagedClassDecorator()`.
- Service scope, Controller prefix, and Provider lifecycle/construction metadata are public Core contracts.
- Provider zero-required-argument construction is validated when the decorator is applied.
- Provider constructor policy is documented in Core and architecture documentation.

## Remaining

- None.

## Acceptance Criteria

- [x] `@Service()` creates `core.service` metadata.
- [x] `@Controller()` creates `core.controller` metadata.
- [x] `@Provider()` creates `core.provider` metadata.
- [x] Service reports `managedMethods=false`.
- [x] Controller reports `managedMethods=true`.
- [x] Provider lifecycle metadata identifies `register` and `boot` without treating them as ordinary managed methods/routes.
- [x] A plain undecorated class receives none of the managed capabilities.
- [x] All three built-ins are specializations of the existing generic class-kind/decorator mechanism.

## Tests Added

- `tests/milestone-03/built-in-kinds.test.ts` — required built-in metadata/capability tests plus Service scope, Controller prefix, generic-specialization, constructor-local inheritance behavior, and Provider constructor-policy coverage.

## Tests Run

- `pnpm typecheck`
- `node node_modules/vitest/vitest.mjs run tests/milestone-03 --reporter=verbose`
- `pnpm --filter @bunwire/core test`
- `pnpm test`
- `pnpm test:clean-install`
- `pnpm quality`
- built-output public-export smoke check with Node ESM
- `git diff --check`

## Test Results

- Passed: finalized Milestone 3 suite, 1 file and 11 tests.
- Passed: Core package regression suite, 4 files and 39 tests.
- Passed: complete repository suite, 6 files and 49 tests.
- Passed: clean frozen-lockfile installation and workspace typecheck in an isolated temporary copy.
- Passed: full quality gate — package boundaries, production/test typechecking, 49 tests, and all four workspace package builds.
- Passed: built Core entrypoint exports all three built-in kinds with their expected IDs.
- Passed: repository diff whitespace/error check.
- Diagnostic failure resolved: the first broad regression run exposed a Milestone 1 assertion that rejected Core-owned IDs as well as adapter IDs; the test now enforces its intended no-adapter-ID boundary and both broad suites pass.
- Diagnostic failure resolved: the first corrected clean-install run found a strict indexed-regex typing issue in that test; the match is now asserted present and the clean-install gate passes.
- Failed in final verification: none.
- Skipped: none.

## Corrective Verification — 2026-08-20

- Provider construction now follows the documented callable-with-zero-arguments rule without relying on `Function.length`.
- Optional, defaulted, and rest constructor parameters are accepted and receive zero supplied arguments.
- Required constructor parameters are rejected at the typed Provider-registry boundary.
- Passed: finalized Milestone 3 suite, 1 file and 13 tests.
- Passed: full repository suite, 7 files and 70 tests.
- Passed: full quality and clean-install gates.
- Failed: none.

## Regression Checks

- Milestones 0–2 tests pass alongside Milestone 3.
- Core contains no adapter-specific production IDs or platform imports.
- All test definitions remain centralized beneath `tests/`.
- Core, Vite, Electrobun, and the Electrobun example build successfully.
- Package-boundary enforcement passes.
- Frozen-lockfile clean installation and typechecking pass.

## Expected Behavior

After this milestone:

- Service, Controller, and Provider classes opt into the managed graph through public Core decorators.
- Service scope and Controller prefix are represented in runtime metadata.
- Provider lifecycle hook names and zero-argument construction policy are represented without exposing lifecycle hooks as routes.

## Not Expected Yet

- Provider `register()`/`boot()` execution, Application startup, managed-method invocation, or compiler discovery.

## Important Decisions

- Providers are constructed with zero supplied arguments in v1; no Provider constructor DI occurs.
- Optional, defaulted, and rest constructor parameters are valid because construction still supplies zero arguments; required parameters are rejected by the typed registry.
- `register(container)` is a framework-owned lifecycle hook, not an ordinary managed method.
- Provider target validation uses the generic decorator-definition mechanism.

## Architectural Issues Encountered

- `Function.length` cannot distinguish required TypeScript constructor parameters from optional parameters without defaults, so the runtime arity check rejected valid zero-callable Providers. The arity check was removed in favor of the typed registry contract and runtime lifecycle-shape validation.

## Deviations or Unresolved Questions

- None.

## Known Limitations

- Provider lifecycle execution remains intentionally deferred to Milestone 4.

## Blockers

- None.

## Next Work Within This Milestone

- None. Milestone 3 is complete; Milestone 4 is next.
