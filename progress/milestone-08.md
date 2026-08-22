# Milestone 8 — TypeScript Symbol Analysis and Constructor DI

Status: Complete

## Packages Changed

- `packages/core`
- `packages/vite`
- `tests/milestone-08`
- `tests/fixtures/milestone-8-analysis`
- Core/Vite public documentation and centralized test matrix

## Implemented

- Authoritative architecture, Milestone 8 requirements, and Milestones 6–7 compiler foundations reviewed.
- Added the public `Inject` runtime-token parameter decorator and stable compiler identity.
- Added one bounded TypeScript `Program`/checker context for configured source files.
- Added resolved-symbol decorator recognition with alias following and same-name resistance.
- Added managed-class discovery through canonical extension descriptor IDs and kinds.
- Added cross-file managed type resolution and runtime-reference records containing use/declaration locations.
- Added indexed constructor plans for inferred managed-class and explicit `@Inject()` sources.
- Added actionable diagnostics for plain classes, erased interfaces, malformed tokens, and conflicting sources.
- Added an integrated `analyzeBunwireApplication()` orchestration API over Milestone 7 discovery.
- Rejected type-only values passed directly to `@Inject()` with `createToken()` remediation.

## Remaining

- None.

## Acceptance Criteria

- [x] Aliased `@Service()` is recognized by symbol.
- [x] Imported managed constructor dependencies auto-inject.
- [x] Plain classes do not auto-inject.
- [x] Explicit class and token `@Inject()` sources compile.
- [x] Interface parameters without explicit injection fail clearly.
- [x] Constructor indexes, aliases, cross-file symbols, and locations are preserved.

## Tests Added

- `tests/milestone-08/constructor-analysis.test.ts` — seven tests covering every required Milestone 8 fixture, same-name behavior, and type-only-token misuse.
- `tests/fixtures/milestone-8-analysis/valid/*` plus invalid plain/interface fixtures.

## Tests Run

- `node_modules\\.bin\\tsc.cmd -b packages\\core packages\\vite --pretty false`
- `node_modules\\.bin\\vitest.cmd run tests/milestone-08/constructor-analysis.test.ts --reporter=verbose`
- `pnpm.cmd quality`
- `pnpm.cmd --filter @bunwire/vite test`
- `pnpm.cmd test:architecture`
- `pnpm.cmd test:clean-install`
- `git -c safe.directory=D:/Projects/GitHub/bunwire/bunwire-monorepo diff --check`

## Test Results

- Passed: focused Milestone 8, 1 file and 7 tests, 0 failed, 0 skipped.
- Passed: Core and Vite production build/typecheck.
- Passed: full quality gate, 12 files and 151 tests, production/test typechecking, package boundaries, and all four workspace builds.
- Passed: Vite Milestones 7–9 regression suite, 3 files and 39 tests.
- Passed: dedicated architecture suite, 3 tests.
- Passed: isolated frozen-lockfile clean installation and workspace typecheck.
- Failed initially: sandboxed clean-install npm downloads were denied with `EACCES`; the identical approved network-enabled rerun passed.

## Regression Checks

- Milestones 0–7 remain green.
- Core remains free of Vite and adapter/platform imports.
- Vite consumes generic class/method/injector descriptors without adapter-specific branches.
- Electrobun and the example application still build.
- Repository diff whitespace validation passes.

## Expected Behavior

After this milestone, compiler analysis will emit complete constructor dependency classifications without runtime signature inference.

## Not Expected Yet

- Managed-method analysis, generated registries, or Milestone 10 output.

## Important Decisions

- Class, decorator, and dependency recognition will use TypeScript symbols and registered descriptor identities.
- Milestone 9 will reuse the same Program, checker, source graph, reference, and diagnostic infrastructure.
- Decorator factory declarations must retain their literal namespaced ID in their public type; Core built-ins now do so explicitly, while symbols without a registered literal compiler identity are ignored rather than matched textually.
- Compiler references retain expressions and resolved declaration locations but no runtime scanning or inference is introduced.

## Known Limitations

- Registry module emission remains intentionally deferred to Milestone 10.

## Architectural Issues Encountered

- Existing decorator factory calls that supplied only the options/data generic parameters widened the decorator ID type, making exact compiler identity unavailable from declarations. Core built-ins and compiler fixtures now retain the literal third ID type explicitly; analysis never falls back to textual decorator names.
- The first parallel compiler-fixture run exceeded Vitest's default five-second per-test ceiling. The test ceiling now matches the repository's existing 120-second compiler/subprocess ceiling; assertions and scenarios were unchanged.

## Blockers

- None.

## Next Work Within This Milestone

- None. The full Milestone 8 section was audited independently and all required focused tests pass.
