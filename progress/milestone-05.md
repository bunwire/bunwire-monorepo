# Milestone 5 — Managed Methods, Parameter Sources, and Invocation Engine

Status: Complete

## Packages Changed

- `packages/core`
- root test infrastructure
- Core architecture/API documentation

## Implemented

- Authoritative Milestone 5 scope, implementation steps, tests, and exit criteria reviewed.
- Runtime design established for generic method kinds, owning-kind restrictions, prebuilt parameter plans, resolver definitions, middleware, and invocation results.
- Namespaced method-kind and parameter-resolver IDs are implemented.
- Generic method kinds declare allowed owning class kinds and invocability without platform branches.
- Prebuilt method plans represent method metadata, extension data, middleware, and all four required parameter sources.
- Structural plan validation enforces owning-kind compatibility and complete, unique method/caller indexes.
- The invocation engine validates caller bounds, reconstructs arguments by explicit indexes, resolves container/custom/context values, and Promise-normalizes middleware/method results.
- Application-managed invocation delegates through the Milestone 4 invocation boundary before executing the plan.

## Remaining

- None.

## Acceptance Criteria

- [x] `ManagedMethodKind` is generic and declares allowed owning class kinds and invocability.
- [x] Method metadata represents invocable target methods, extension data, middleware, and complete parameter plans.
- [x] Parameter sources represent transport/caller, container, custom resolver, and framework context values.
- [x] Real method indexes and caller argument indexes are independent.
- [x] Arbitrarily ordered prebuilt plans reconstruct the complete method argument list correctly.
- [x] Container and resolver parameters can be interleaved with caller arguments and each other.
- [x] Required and optional caller arguments are validated, including too few and too many values.
- [x] Unknown resolver IDs fail with an actionable diagnostic.
- [x] Middleware wraps generic invocation and async-normalized result semantics are defined.
- [x] A fake managed class/method kind invokes end to end without platform dependencies.
- [x] Runtime execution consumes metadata without classifying or inferring parameter sources.

## Tests Added

- `tests/milestone-05/managed-methods.test.ts` — method-kind/plan validation, arbitrary reconstruction, index independence, container/resolver interleaving, caller validation, diagnostics, middleware/results, and fake-kind integration.

## Tests Run

- `pnpm typecheck`
- `node node_modules/vitest/vitest.mjs run tests/milestone-05 --reporter=verbose`
- `pnpm --filter @bunwire/core test`
- `pnpm test`
- `pnpm test:clean-install`
- `pnpm quality`
- built-output public-export smoke check with Node ESM
- platform-reference scan of Core managed-method/Application production source
- `git diff --check`

## Test Results

- Passed: workspace production and test typechecking.
- Passed: finalized Milestone 5 suite, 1 file and 14 tests.
- Passed: Core package regression suite, 6 files and 74 tests.
- Passed: complete repository suite, 8 files and 84 tests.
- Passed: clean frozen-lockfile installation and workspace typecheck in an isolated temporary copy.
- Passed: full quality gate — package boundaries, production/test typechecking, 84 tests, and all four workspace package builds.
- Passed: built Core entrypoint loads the managed-method, plan, resolver, engine, and diagnostic public exports.
- Passed: Core managed-method/Application production source contains no Electrobun, Express, browser-window, webview, or Node host references.
- Passed: repository diff whitespace/error check.
- Failed in final verification: none.
- Skipped: none.

## Regression Checks

- Milestones 0–4 pass alongside Milestone 5.
- Core remains platform-independent and passes package-boundary enforcement.
- All test definitions remain centralized beneath `tests/`.
- Core, Vite, Electrobun, and the Electrobun example build successfully.
- Frozen-lockfile clean installation and production/test typechecking pass.

## Expected Behavior

After this milestone:

- Core can execute a generated/prebuilt method plan solely from its explicit indexes and parameter-source metadata.
- Custom runtime resolvers and middleware remain generic and platform-independent.

## Not Expected Yet

- Source discovery, method-decorator compilation, generated registries, adapters, Electrobun route/message semantics, or generated frontend contracts.

## Important Decisions

- Parameter source discriminants are `transport`, `container`, `resolver`, and `context`, matching the architecture terminology.
- Plan arrays may arrive in arbitrary order; real method and caller indexes are the only positional authority.
- Transport argument indexes must be contiguous; the minimum count is one past the highest required index, supporting defaulted/optional positions before later required positions.
- Managed invocation results are Promise-normalized so synchronous methods, async methods, middleware transforms, and thrown/rejected errors share one contract.
- Application integration delegates to the existing `runInvocation()` boundary so Provider boot and invocation-scope ordering remain authoritative.

## Architectural Issues Encountered

- None.

## Deviations or Unresolved Questions

- None.

## Known Limitations

- Rest-parameter transport plans are not introduced because Milestone 5 requires required/optional positional arguments only.

## Blockers

- None.

## Next Work Within This Milestone

- None. Milestone 5 is complete; Milestone 6 is next.
