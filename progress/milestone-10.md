# Milestone 10 — Generated Registries and Runtime Execution

Status: Complete

## Packages Changed

- `packages/core`
- `packages/vite`
- `tests/milestone-10`
- `tests/fixtures/milestone-10-registry`

## Implemented

- Authoritative architecture, complete Milestone 10 requirements, and Milestones 8–9 implementation records reviewed.
- Existing compiler analysis and Core runtime registry/application/invocation paths mapped before implementation.
- Extended the shared `RuntimeRegistry` contract with deterministic class scope, indexed constructor dependencies, generated Providers, and authoritative managed-method plans.
- Connected generated class defaults to the root Container before Provider registration, preserving Provider binding precedence and normal missing-binding diagnostics.
- Connected generated Providers to the existing deduplicated `register()`/`boot()` lifecycle without compiler execution.
- Added deterministic exported-symbol imports, stable literal serialization, canonical class/method-kind references, branded resolver identities, middleware arrays, and SHA-256 content hashes.
- Added `virtual:bunwire/registry` and a structural Vite plugin with per-build analysis caching and invalidation.
- Preserved package independence and generic adapter-owned class/method/data handling with no Electrobun-specific compiler or Core branches.
- Required runtime-imported managed classes and injection tokens to be exported, with a source-located generation diagnostic.
- Added fail-closed runtime validation for class scope, constructor dependency tokens/indexes, generated Provider membership, duplicate Providers, and duplicate managed-method identities.

## Remaining

- None.

## Acceptance Criteria

- [x] Generated TypeScript typechecks.
- [x] Equivalent compilation produces deterministic output.
- [x] Runtime performs no source-tree scanning.
- [x] Generated constructor metadata constructs a Controller through the Container.
- [x] Generated managed-method metadata executes interleaved caller/container/resolver parameters.
- [x] Generated Providers run `register()` once and `boot()` per invocation.
- [x] A fake adapter registry executes end to end through generic extension APIs.
- [x] Missing runtime token bindings use normal Container diagnostics.

## Tests Added

- `tests/milestone-10/generated-registry.test.ts` — twelve tests covering deterministic output/hash, generated TypeScript semantic typechecking, Provider compile-time non-execution, duplicate identity rejection, canonical and invalid virtual modules, Vite load caching/rebuild stability, Controller construction, interleaved fake-adapter execution, Provider lifecycle, missing bindings, malformed registries, and runtime no-scanning architecture.
- `tests/fixtures/milestone-10-registry/app.ts` — Service scopes, constructor-injected Controller, Provider bindings/lifecycle, fake adapter-managed class and methods, interleaved caller/container/token/resolver sources, and a missing-token path.

## Tests Run

- `node_modules\\.bin\\tsc.cmd -b packages\\core packages\\vite --pretty false`
- `node_modules\\.bin\\tsc.cmd -p tsconfig.tests.json --noEmit --pretty false`
- `node_modules\\.bin\\vitest.cmd run tests/milestone-05 tests/milestone-06 tests/milestone-07 tests/milestone-08 tests/milestone-09 tests/milestone-10 --reporter=dot --pool=forks --maxWorkers=1`
- `pnpm.cmd quality`
- `pnpm.cmd --filter @bunwire/vite test`
- `pnpm.cmd test:architecture`
- `pnpm.cmd test:clean-install`
- `git -c safe.directory=D:/Projects/GitHub/bunwire/bunwire-monorepo diff --check`

## Test Results

- Passed: focused Milestones 5–10 regression run, 6 files and 100 tests.
- Passed: final focused Milestones 8–10 run, 3 files and 37 tests.
- Passed: full quality gate, 13 files and 171 tests, production/test typechecking, package-boundary validation, and all four workspace builds.
- Passed: Vite Milestones 7–10 package suite, 4 files and 58 tests.
- Passed: dedicated architecture suite, 3 tests.
- Passed: isolated frozen-lockfile clean installation and workspace typecheck.
- Passed: repository diff whitespace validation.
- Initial non-code failure: parallel Vitest workers reported an RPC `onTaskUpdate` timeout after all 170 assertions passed; the suite now uses one fork worker and the unchanged assertions pass reliably.
- Initial environment failure: sandboxed clean-install downloads were denied with `EACCES`; the identical approved network-enabled rerun passed, as did the final post-audit rerun.

## Regression Checks

- Milestones 0–9 remain green.
- Existing prebuilt registry consumers remain compatible through normalized default scope/dependency/provider values.
- Core remains free of Vite, TypeScript, filesystem scanning, and adapter/platform imports.
- Vite remains generic and contains no Electrobun-specific class/method/injector branches.
- Electrobun and example workspace packages still build.
- Generated temporary registry source is removed after tests.

## Expected Behavior

After this milestone, a platform-independent application will run from deterministic compiler-generated registries without runtime source discovery or parameter reclassification.

## Not Expected Yet

- Electrobun-specific runtime behavior.
- Generated RPC contracts and Milestone 11+ functionality.

## Important Decisions

- Extend Core's existing `RuntimeRegistry`, Application startup, Container constructor metadata, Provider lifecycle, adapter registry consumers, and InvocationEngine rather than introducing parallel runtime machinery.
- Reserve `virtual:bunwire/registry` as the generated runtime registry module within the Milestone 7 namespace.
- Use canonical decorator exports (`definition.kind`) in generated code so runtime validation sees the exact descriptors registered by Core/adapters.
- Preserve public package module specifiers for imported runtime tokens and use deterministic relative imports for application-owned exports.
- Emit explicit empty middleware arrays until a registered middleware decorator contributes entries; runtime validation remains authoritative.
- Default injectable generated classes to singleton while preserving explicit built-in Service transient metadata.
- Serialize deterministic literal metadata only and reject unsupported runtime values or duplicate generated identities before output.

## Known Limitations

- Generated RPC contracts remain Milestone 12 work.
- No Electrobun-specific transport behavior is included.

## Architectural Issues Encountered

- Parallel compiler fixtures can saturate Vitest workers enough to time out worker RPC despite passing assertions. The centralized suite now uses one fork worker for deterministic verification without changing test behavior.

## Blockers

- None.

## Next Work Within This Milestone

- None. The complete Milestone 10 section was audited item by item and all required tests and exit criteria pass.
