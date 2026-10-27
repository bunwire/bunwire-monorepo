# Milestone 22 — Cross-Package Hardening and Completion

Status: Complete

## Packages Changed

- `@bunwire/vite` development watcher (`packages/vite/src/plugin.ts`), project integration fixtures/tests under `tests/fixtures/milestone-22-billing/` and `tests/milestone-22/`, and Core/Vite/Bun/Electrobun architecture and package documentation.

## Implemented

- Added one billing fixture combining re-exported job constants, arithmetic, spread middleware collections, computed Controller mappings, imported helpers, repeated policy blocks, and bounded iteration over a canonical job class.
- Generated Bun registry executes queue dispatch, schedule delivery, compiled retry/timeout policy, constructor DI, Provider boot, and HTTP middleware in a real Bun process.
- The same middleware composition executes through Electrobun and a fake adapter; both match byte-for-byte generated registries and hashes against equivalent inline declarations.
- Integrated Vite fixture edits re-exported queue values and imported middleware helpers, verifies byte-stable regeneration, reports invalid values, recursive helpers, excessive expansion, and deleted dependencies, and recovers after each repair. Vite's add/unlink events now refresh analysis and invalidate cached virtual modules; deletion previously left a cached successful registry transform.
- The native Electrobun smoke passed after restoring four locally modified SDK imports from the pristine pinned `electrobun@1.18.1` package extraction. The package archive already contains valid relative imports, so no dependency patch or repository change was required.

## Remaining

- None within this milestone.

## Acceptance Criteria

- [x] Representative generated application combines all documented static composition features.
- [x] Required Bun, Electrobun, and generic runtime behavior passes.
- [x] Generated output, Vite regeneration/recovery, rejection diagnostics, and type contracts pass in focused and prior-track fixtures.
- [x] Architecture and documentation audits pass.
- [x] All required release and regression gates pass, including the native Electrobun smoke after the local SDK installation was restored.

## Tests Added

- `tests/milestone-22/billing-integration.test.ts` — compiled policy and real Bun child.
- `tests/milestone-22/policy-adapters.test.ts` — Electrobun/generic runtime and inline output equivalence.
- `tests/milestone-22/billing-vite.test.ts` — real Vite edit, deletion/error, restoration, and unchanged-generation check.

## Tests Run

- `pnpm exec vitest run tests/milestone-22/billing-integration.test.ts` — 3 passed after adding deterministic repeated-analysis coverage.
- `pnpm exec vitest run tests/milestone-22/policy-adapters.test.ts` — 4 passed.
- `pnpm typecheck` — passed after the above changes.
- Initial `pnpm quality` — boundaries, typecheck, and Electrobun SDK contract passed; full suite 1,021 passed and 1 failed out of 1,022. The sole failure was an outdated Milestone 12 expected error phrase; its focused suite passed 3/3 after correction. Later full quality reruns passed, as recorded below.
- `pnpm test:release-pack` — passed, all release tarballs/manifests, isolated typechecking, and ESM imports.
- `pnpm test:clean-install` — passed, frozen-lockfile install and workspace typecheck.
- `pnpm build` — passed across 8 workspace projects.
- `pnpm test:built-exports` — passed all release package runtime/declaration allowlists.
- `pnpm test:electrobun-native` — failed twice. First run stopped during SDK Windows binary acquisition. Second run downloaded and extracted 50,531,883 bytes but SDK build failed to resolve `../../../../../../../../node_modules/electrobun/dist/api/shared/rpc.js` from its own `dist/api/browser/index.ts`; none of the required smoke markers were reached.
- `pnpm performance:sanity` — passed; compiler median 1866.65 ms, startup median 0.01395 ms, invocation median 0.00350 ms per call over 5,000 calls, unchanged regeneration paths `[]`.
- `pnpm performance:sanity:bun` — 3 passed across 2 files; 30 routes 132.7 ms, 20 Form Requests 264.6 ms, 20 events 116.3 ms, worker drain 401.1 ms, schedule tick 6.6 ms.
- `tests/milestone-20/policy-loop-budgets.test.ts` — passed in the 1,021 passing full-suite tests; covers 10,000 declaration boundary and node/depth limits.
- Final pre-watcher-change `pnpm quality` — passed: boundaries, typecheck, SDK contract, 1,022/1,022 tests across 132 files, workspace build, and built-export audit.
- `pnpm exec vitest run tests/milestone-22/billing-vite.test.ts` — 1 passed after add/unlink watcher fix.
- `pnpm exec vitest run tests/milestone-21/dependency-watching.test.ts tests/milestone-12/virtual-modules-vite.test.ts` — 4 passed across 2 files after watcher fix.
- `pnpm typecheck` — passed after watcher fix and test type correction.
- Final post-watcher-change `pnpm quality` — passed: boundaries, typecheck, Electrobun SDK contract, 1,023/1,023 tests across 133 files, workspace build, and built-export audit. Full-suite duration 2229.55 seconds on this Windows host.
- Post-watcher-change `pnpm test:release-pack` — passed all release tarballs, manifests, isolated typechecking, and ESM imports.
- Post-watcher-change `pnpm test:clean-install` — passed frozen-lockfile install and workspace typecheck.
- Final `pnpm test:electrobun-native` — passed: registry generated, native Windows host started, request middleware/controller, short-circuit middleware, message middleware, and completion markers all observed. Four pre-existing rewritten imports in local `node_modules/electrobun` were restored from pnpm's pristine `electrobun@1.18.1` extraction before this run.
- Expanded `pnpm exec vitest run tests/milestone-22/billing-vite.test.ts` — 1 passed, including Vite diagnostics and recovery for recursive helper and 10,001-entry expansion.
- Final `pnpm typecheck` — passed after the expanded test.
- Post-documentation `pnpm typecheck`, `pnpm test:electrobun-sdk-contract`, and `git diff --check` — passed.

## Test Results

- Passed: 8 Milestone 22 focused tests, 3 corrected Milestone 12 focused tests, dependent watcher regressions, final full suite 1,023/1,023, typecheck, release pack, clean install, build, built exports, native Electrobun smoke, and performance sanity checks.
- Current failures: 0. The initial root quality run found one outdated assertion, corrected and directly retested. Initial native attempts failed because four SDK files in the local installation had non-package import paths; the final native run passed after restoring pristine files.

## Regression Checks

- Bun, Electrobun, and generic adapter generated-registry behavior checked. Final post-change full suite passed 1,023/1,023 across 133 files; package builds and export audits passed.
- Package-boundary script passed; repository search found no TypeScript/static-policy evaluator or `analyzeBunwireProgram` import in Core, Bun, or Electrobun runtime sources. New Vite add/unlink handling is generic and has no adapter-specific branch.
- Prior-track automated tests cover canonical targets/caller contracts, arbitrary calls, mutation, source boundaries, recursive helpers, unsupported loops, 64-level depth, 100,000-node, and 10,000-declaration limits. Milestone 22's direct tests cover accepted integrated syntax and generated/runtime results.
- All project track records 15–21 remain `Status: Complete`; this record is now `Status: Complete`. The project index links every record. Earlier restrictions remain dated checkpoint history.

## Expected Behavior

- The full static composition language works through manual generation and Vite. The combined generated application runs through Bun, Electrobun, and generic adapters, including real Bun scheduling, queue dispatch, middleware, job policy, DI, and Provider lifecycle. Vite tracks consumed project-local imports and recovers from invalid or deleted sources.

## Not Expected Yet

- General JavaScript evaluation, dynamic metadata, arbitrary package helper evaluation, config/adapter-discovery expansion, or runtime metadata mutation.

## Important Decisions

- Verify the integrated static language through generated artifacts and existing supported adapters and drivers.
- Corrected a Milestone 12 test expectation because its literal-only error wording contradicted the now-authoritative static string-reference architecture; the negative behavior (rejecting a non-canonical value) was retained.
- A deleted imported dependency emits a Vite websocket diagnostic; it need not throw through an already-cached `transformRequest()` call. The watcher now refreshes and invalidates virtual module cache on add/unlink so subsequent analysis uses current sources.
- Updated the Bun and Electrobun package guides to remove pre-Milestone-19/20 claims that repeated blocks and bounded loops were still deferred.

## Known Limitations

- The published Electrobun 1.18.1 archive has valid relative imports. Local `node_modules` can be altered independently of the lockfile; the native smoke relies on a pristine installation. General JavaScript evaluation, dynamic metadata, arbitrary package helper evaluation, config/adapter-discovery expansion, and runtime metadata mutation remain intentionally unsupported.

## Blockers

- None.

## Next Work Within This Milestone

- None; Milestone 22 is complete.

## Historical Restrictions Superseded

- Milestone 15's direct static-resolver foundation and Milestones 16–17's initial inline/value restrictions describe those checkpoints only. Milestones 18–20 added typed imported helpers, repeated policy blocks, and bounded `for...of` expansion; Milestone 21 added imported-dependency watching and recovery. Earlier progress files remain historical evidence and are not rewritten to imply the later syntax existed at their checkpoints.

## Post-Completion Review Fix — 2026-10-27

- Corrected the roadmap sequence table's stale Milestone 22 "Planned" status to "Complete".
- Expanded the real Vite billing fixture with a newly imported helper outside `sourceRoots`: the invalid import preserves the last artifact, and creating the helper alone recovers generated output without discovering the helper's managed class. The focused case passed (1 passed, 1 filtered), and the affected Milestone 18/21/22 suites passed 57/57 tests across 6 files before a final helper-alias adjustment.
- Final `pnpm quality` passed after the helper-alias adjustment: package boundaries, typecheck, Electrobun SDK contract, full Vitest suite, all workspace builds, and built-export audit. The original release-gate history above remains the evidence for Milestone 22 completion.
