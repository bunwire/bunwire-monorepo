# Milestone 19 — Multiple Application Policy Blocks

Status: Complete

## Packages Changed

- `@bunwire/core` Application configuration; `@bunwire/vite` policy collection and test script; focused tests/fixtures and current API/architecture documentation.

## Implemented

- Work began from the completed Milestone 18 static-helper foundation.
- Core accepts repeated compile-only calls; Vite accumulates middleware and schedule blocks in exported-chain order, with one shared group collection and schedule list.
- Migrated legacy once-only rejection tests to the new contract and added Milestone 19 behavioral/compiler/integration/output tests.
- Updated Core, Vite, and architecture guides for repeatable compile-only blocks, cross-block group resolution, ordering, and schedule-ID validation.

## Remaining

- None for Milestone 19. Static loops and complete imported-dependency watcher integration remain assigned to Milestones 20 and 21.

## Acceptance Criteria

- [x] Both repeated APIs work through Core and Vite with one documented composition contract.
- [x] Duplicate behavior and ordering are tested across blocks and helper boundaries.
- [x] Current architecture and API docs describe repeated configuration accurately.
- [x] Core, compiler, and affected adapter checks pass and are recorded.

## Tests Added / Tests Run / Test Results

- `tests/milestone-19/policy-blocks.test.ts` covers repeated Core calls, exported-chain ordering, cross-block group resolution and rejection, schedule IDs, malformed access, unrelated chains, generated equivalence, and Bun/Electrobun/generic runtime execution. `tests/fixtures/milestone-19-policy/` owns its temporary bootstrap root.
- First `pnpm exec tsc -p packages/vite/tsconfig.json --noEmit --pretty false` found one nullable AST-node annotation; fixed it. Focused rerun passed.
- Initial `pnpm exec vitest run tests/milestone-19`: 11 passed, 1 failed. The interleaved fixture included middleware classes whose `csrf` alias collided with Bun's contributed alias; narrowed it to empty middleware blocks because ordering of actual middleware is covered by the Electrobun/generic runtime cases. Suite cleanup also met a transient Windows `EBUSY` on an imported generated module; added guarded retry cleanup.
- Direct Milestone 19 rerun: **1 file, 12 tests passed, 0 failed** (`.cache/milestone-19-direct.json`).
- Focused dependent-policy regression (`tests/milestone-12d/core-middleware-policy.test.ts`, `tests/milestone-14/core-schedules.test.ts`, `tests/milestone-12d/middleware-policy-invalid.test.ts`, and Milestones 17–18): **5 files, 99 tests passed, 0 failed** (`.cache/milestone-19-policy-regression.json`).
- `pnpm exec tsc -p tsconfig.tests.json --noEmit --pretty false`: passed.
- `pnpm --filter @bunwire/core test --reporter=dot --reporter=json --outputFile=D:/Projects/GitHub/bunwire/bunwire-monorepo/.cache/milestone-19-core-final.json`: **12 files, 150 tests passed, 0 failed**.
- `pnpm typecheck`: passed for the workspace packages and test sources.
- `pnpm check:boundaries`: passed.
- `pnpm --filter @bunwire/vite test --reporter=dot --reporter=json --outputFile=D:/Projects/GitHub/bunwire/bunwire-monorepo/.cache/milestone-19-vite-final.json`: **22 files, 352 tests passed, 0 failed** (including all 12 Milestone 19 cases).
- `pnpm build`: passed for all workspace packages and the fake queue, Bun, and Electrobun examples.
- `pnpm test:built-exports`: passed public runtime/declaration export allowlists for all release packages.
- `git diff --check`: passed.

## Important Decisions

- Process the exported Application receiver chain in configuration order; `applicationCallChain()` currently returns outermost calls first.
- Reuse the shared static-analysis session and the existing middleware normalization and schedule-ID validation.

## Architectural Issues / Deviations

- None identified.

## Expected Behavior / Not Expected Yet

- Repeated policy blocks compose in chain order, while Core never stores or executes their callbacks. Middleware groups may be referenced before declaration across blocks, and all schedule entries reach the generated registry in order.
- Not expected: static loops or complete imported-dependency watcher integration.

## Regression Checks

- Direct/dependent policy suites, full Core/Vite package checkpoints, workspace type checks and boundaries, workspace build, built-export audit, and real Bun/Electrobun/generic adapter cases passed.

## Known Limitations / Blockers

- None.

## Next

- Project Milestone 20 — bounded static `for...of` expansion.
