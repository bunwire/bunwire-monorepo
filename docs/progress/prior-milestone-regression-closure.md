# Prior-Milestone Regression Closure

Status: Complete

## Purpose

Close regressions discovered in the completed Milestones 7–12F before beginning Milestone 13. Milestone 13 remains unstarted.

## Packages Changed

- `packages/core`
- `packages/vite`
- `examples/electrobun-app`
- repository documentation and progress records

## Acceptance Criteria

- [x] Runtime tokens are nominal, structurally forged tokens are rejected, and only constructable functions are class tokens.
- [x] Generated imports retain public package aliases, default exports, namespace members, and canonical local exports.
- [x] Compiler path identity respects the host filesystem's case sensitivity.
- [x] `virtual:bunwire/registry` and `virtual:bunwire/client` have exact generated TypeScript declarations.
- [x] Vite development invalidates Bunwire analysis and virtual modules for relevant config/bootstrap/source changes without output churn or watch loops.
- [x] Middleware status, architecture/package documentation, historical milestone notes, and project progress agree with the corrected implementation.

## Implemented

- Created this dedicated pre-milestone closure record.
- Branded Core tokens privately, strengthened token shape validation, and replaced the function-only class-token predicate with a non-executing constructability check.
- Applied runtime-token validation consistently to Container lookups/bindings and generated constructor/method plan validation.
- Preserved public named/default/namespace package export identities in compiler runtime references and generated imports.
- Centralized case-aware compiler path identity across analysis, registry generation, and middleware bootstrap lookup.
- Added `generateBunwireArtifacts()`, exact ambient declarations, unchanged-byte write suppression, and shared example generation.
- Added real Vite peer typing, build/watch/HMR analysis refresh, source-root recomputation, virtual-module invalidation, generated-output exclusion, serialized watcher refreshes, and rename-race-safe discovery.
- Reconciled architecture, milestones, middleware status, package/example guidance, and affected historical milestone records.

## Remaining

- None.

## Tests Added

- Core token/container and managed-plan validation regressions.
- Public package named/default/namespace re-export generation and host-aware case identity regressions.
- Exact virtual declaration semantic typechecking, unchanged-output checks, and a real Vite middleware-mode server covering edits, additions, deletions, renames, config/source-root changes, and virtual-module invalidation.

## Tests Run

- `pnpm typecheck`
- Targeted closure suite: Milestones 2, 5, 7, 8, 9, 10, and 12 virtual/generated-client coverage.
- `pnpm quality`
- `pnpm test:electrobun-native`
- `pnpm test:clean-install`
- `git diff --check`

## Test Results

- Passed: workspace typecheck; 8 targeted files and 110 tests.
- Passed: final repository quality gate — package boundaries, workspace typechecking, Electrobun 1.18.1 SDK contract, 33 files and 338 tests, all workspace builds, and built-export audit.
- Passed: real Windows Electrobun native process with startup, request middleware, Controller, short-circuit, message middleware, and completion markers.
- Passed: isolated frozen-lockfile install and production/test workspace typechecking.
- Passed: final whitespace and unexpected-file inspection; generated registry/client artifacts remained byte-stable and no temporary Vite fixture directories remained.
- Failed: 0
- Skipped: 0

## Intermediate Gate Corrections

- The first full-suite attempts completed all assertions but exposed Vitest fork-RPC reporting timeouts under the repository's long single-worker compiler load. The suite retains one worker and isolation but now uses the thread transport plus the compact reporter; the final 33-file/338-test run passed in 485.19 seconds without worker errors.
- The first real-Vite full-suite attempt sampled declaration modification time before the preceding config regeneration had settled. The regression now waits for stable output before asserting that an unrelated file causes no rewrite.
- The first frozen-install attempt rejected the manually placed Vite peer lock entry. The lockfile now records pnpm's auto-installed peer resolution in the workspace importer, and the frozen clean install passes.
- The sandboxed native smoke could not follow Electrobun package junctions and failed with `EPERM`; the unchanged approved unrestricted rerun passed every native marker.

## Important Decisions

- Preserve `virtual:bunwire/*` as the recommended Vite-facing public contract.
- Preserve physical `.bunwire` artifacts for manual and non-Vite builds.
- Treat `createToken()` as the only supported public token-construction path.
- Record this work as a non-numbered closure rather than inventing Milestone 12G.

## Expected Behavior

After this closure, previously completed milestone behavior remains intact while virtual modules work in editors and `tsc`, Vite development output stays current, generated imports use valid public identities, runtime metadata validation fails closed, and path identity is correct on case-sensitive hosts.

## Not Expected Yet

- Milestone 13 packaging, performance budgets, release automation, changelog, versioning, or publishing work.

## Blockers

- None.

## Regression Checks

- Core/container, managed-method, compiler discovery/analysis, generated registry/client, middleware redesign, Electrobun adapter/host, package-boundary, build, export, clean-install, and real-native behavior all pass.
- Milestone 13 release work was not started.

## Next Work

- Milestone 13 — Hardening and First Release.
