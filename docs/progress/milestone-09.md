# Milestone 9 — Managed-Method Parameter Plans and Compiler Validation

Status: Complete

## Packages Changed

- `packages/core`
- `packages/vite`
- `tests/milestone-09`
- `tests/fixtures/milestone-8-analysis`
- Core/Vite public documentation, package test script, and centralized test matrix

## Implemented

- Milestone 8 Program, symbol, managed-class, runtime-reference, and diagnostic foundation completed and verified.
- Initial analyzer support for method decorators, parameter classification, caller indexes, optional/rest semantics, and caller bounds added on the shared analysis pass.
- Core runtime plan/interpreter extended to validate and execute a final caller-visible rest parameter.
- Complete source-order method enumeration with canonical method-kind placement validation.
- Complete classification order: registered injector, explicit `@Inject()`, injectable managed class, then caller transport.
- Independent method and caller indexes, optional/rest flags, and precomputed minimum/maximum caller bounds.
- Literal decorator metadata compilation for runtime-ready class, method, and resolver data.
- Source-located diagnostics for duplicate managed decorators, invalid owners, malformed options, and conflicting parameter sources.
- Exact canonical-symbol authorization for managed-method and parameter-injector decorators, including alias/re-export handling and same-ID counterfeit rejection.
- Compile-time rejection of static, abstract, and declaration-only managed methods that cannot produce Core instance invocation plans.

## Remaining

- None.

## Acceptance Criteria

- [x] Direct, middle-injected, and interleaved indexes compile correctly.
- [x] Explicit container and framework resolver sources are caller-invisible.
- [x] Optional/rest caller semantics and compact indexes are preserved.
- [x] Managed types auto-inject while plain DTO/classes remain caller-visible.
- [x] Injector precedence over type inference is preserved.
- [x] Runtime caller bounds use compiled plans.
- [x] Invalid placement and conflicting sources fail clearly.

## Tests Added

- `tests/milestone-09/method-analysis.test.ts` — twelve compiler-fixture and runtime behavioral tests covering every required Milestone 9 checkbox plus rest execution, undecorated-method exclusion, counterfeit identities, and invalid runtime method shapes.
- Shared method, extension, invalid-placement, and conflicting-source fixtures beneath `tests/fixtures/milestone-8-analysis`.

## Tests Run

- `node_modules\\.bin\\tsc.cmd -b packages\\core packages\\vite --pretty false`
- `node_modules\\.bin\\tsc.cmd -p tsconfig.tests.json --noEmit --pretty false`
- `node_modules\\.bin\\vitest.cmd run tests/milestone-08 tests/milestone-09 --reporter=verbose`
- `pnpm.cmd quality`
- `pnpm.cmd --filter @bunwire/vite test`
- `pnpm.cmd test:architecture`
- `pnpm.cmd test:clean-install`
- `git -c safe.directory=D:/Projects/GitHub/bunwire/bunwire-monorepo diff --check`

## Test Results

- Passed: focused Milestones 8–9, 2 files and 25 tests, 0 failed, 0 skipped.
- Passed: Core package suite, 7 files and 102 tests.
- Passed: full quality gate, 12 files and 159 tests, production/test typechecking, package boundaries, and all four workspace builds.
- Passed: Vite Milestones 7–9 regression suite, 3 files and 47 tests.
- Passed: dedicated architecture suite, 3 tests.
- Passed: isolated frozen-lockfile clean installation and workspace typecheck.
- Failed initially: sandboxed clean-install npm downloads were denied with `EACCES`; the approved network-enabled rerun passed without repository changes.

## Regression Checks

- All Milestones 0–8 tests pass with Milestone 9.
- Existing Core method-plan validation and invocation tests remain green.
- Electrobun and example packages build without compiler-specific or adapter-specific Core leakage.
- Runtime packages remain free of filesystem source discovery.
- Repository diff whitespace validation passes.

## Expected Behavior

After this milestone, runtime receives complete managed-method parameter plans and performs no signature inference.

## Not Expected Yet

- Generated registries or any Milestone 10 functionality.

## Important Decisions

- Method analysis reuses Milestone 8's single Program/checker and canonical extension identities.
- Managed-method and parameter-injector authority comes from exact registered module-export symbols, never matching IDs alone.
- Managed methods remain concrete instance methods in v1; unsupported static/declaration shapes fail during compilation.
- Parameter classification order is registered injector, explicit `@Inject()`, managed injectable class, then caller transport.
- Caller bounds are emitted on compiler analysis records; Core may deterministically validate from the explicit plan and never inspects signatures.
- A rest source is supported only as the final method/caller parameter and expands remaining caller values during invocation.

## Known Limitations

- Generated runtime registry modules remain intentionally deferred to Milestone 10.

## Architectural Issues Encountered

- Core's original transport parameter shape had optionality but no rest marker. It was minimally extended with a validated optional `rest` flag and unbounded caller maximum while preserving all existing plan shapes.
- Parallel TypeScript Program fixtures exceeded Vitest's default five-second test ceiling under load; the ceiling was aligned with the existing 120-second compiler/subprocess limit without weakening assertions.

## Blockers

- None.

## Next Work Within This Milestone

- None. The full Milestone 9 section was audited independently and every required compiler/behavioral test and exit criterion passes.

## Prior-Milestone Regression Closure — 2026-08-24

- Runtime plan validation now accepts only nominal `createToken()` values or constructable class tokens; forged structural tokens and arrow/generator functions fail closed.
- Full details and verification are recorded in [the dedicated closure record](prior-milestone-regression-closure.md).
