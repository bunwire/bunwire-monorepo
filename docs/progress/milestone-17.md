# Milestone 17 — Composable Middleware and Schedule Values

Status: Complete

## Packages Changed

- `@bunwire/vite`: central policy parsing, resolved references, provenance, and budget integration.
- `@bunwire/bun`: source-aware compiler schedule validation errors; runtime scheduling semantics unchanged.
- `@bunwire/core`: documentation of the optional schedule-validator `Error.cause` convention.
- Tests and architecture/compiler/adapter documentation.

## Implemented

- Middleware policy values use the analysis-local static resolver: shared arrays, mixed canonical classes/aliases, group names, argument spreads, mapping objects, object spreads, and computed Controller patterns.
- Schedule targets, payload tuples, cadence/modifier arguments, timezones, and IDs use the same session; arity is checked after positional expansion.
- Canonical targets remain checked against discovered/contributed maps. Existing middleware ordering, parameter-sensitive deduplication, group validation, schedule validation, and ID uniqueness remain intact.
- Imported mapping keys and invalid adapter values preserve source provenance. Generic handlers can identify a supplied call or payload argument through optional standard `Error.cause` metadata.
- Intermediate group copies, cached group depths, and pre-deduplication attachments are bounded by the shared limits.
- Real middleware/security fixtures prove the exact COMMON_SECURITY/ADMIN_GLOB example, generated equivalence, Electrobun and generic execution order. A real Bun scheduler process delivers the composed job payload.

## Remaining

- None. All acceptance criteria and required regression checks are complete.

## Acceptance Criteria

- [x] Shared arrays, spreads, and computed mapping keys work in supported policy positions.
- [x] Resolved values receive existing semantic validation and canonical authorization.
- [x] Errors preserve imported value and key locations.
- [x] Required tests and dependent adapter checks pass and are recorded.

## Tests Added

- `tests/milestone-17/policy-composition.test.ts`: 38 cases covering collections, generation equivalence, both middleware hosts, actual scheduled delivery, invalid targets/arity/payloads/cadences, imported provenance, unrelated adapter diagnostics, exact declaration limits, group amplification, and depth/cache order.
- Existing middleware-policy and scheduler compiler fixtures migrated only where their literal-only assertions conflict with this milestone.

## Tests Run / Test Results

- Initial legacy policy/scheduler run: 46 passed, 2 failed (48 total). Both failures were obsolete literal-only expectations, migrated to the now-supported behavior.
- Initial new fixture run: 5 passed, 1 failed; the generic adapter reused an unnecessary injector contribution. Replaced with its minimal own descriptor.
- An intermediate expanded run failed to collect due to an extra closing brace; corrected. Initial root typecheck also identified missing fixture override modifiers; corrected.
- `pnpm exec vitest run tests/milestone-17 --reporter=dot --reporter=json --outputFile=.cache/milestone-17-new-expanded.json`: 37 passed, 0 failed.
- Focused added unrelated schedule-adapter diagnostic case: 1 passed, 37 skipped by name filter, 0 failed (`.cache/milestone-17-generic-diagnostic.json`). Together all 38 current cases passed.
- `pnpm typecheck`: passed after final source/test changes.
- `pnpm check:boundaries`: passed.
- `pnpm exec vitest run tests/bun/milestone-13 tests/milestone-12e --reporter=dot --reporter=json --outputFile=.cache/milestone-17-adapters-final.json`: 5 files passed, 40 tests passed, 0 failed, exit 0.
- `pnpm build`: passed across all workspace packages/examples, including generated Bun client/SSR output and the Electrobun example.
- `pnpm test:built-exports`: passed for all release package runtime/declaration allowlists.
- Final compiler package checkpoint: **20 files passed, 300 tests passed, 0 failed, 0 skipped**, exit 0. Includes all **38 Milestone 17 tests**. Command: `pnpm --filter @bunwire/vite test --reporter=dot --reporter=json --outputFile=../../.cache/milestone-17-compiler-final.json`. Vitest resolved that relative report path outside the workspace; the retained report was copied into `.cache/milestone-17-compiler-final.json`.
- Final retained checkpoints total **340 passing tests**, with no failures.
- `git -c core.safecrlf=false diff --check`: passed.

## Important Decisions

- One shared resolver session spans metadata and both policy types. No new public APIs, dependencies, or registry schema changes.
- Direct callback/receiver grammar and once-only policy configuration remain unchanged. Helpers, local declaration expansion, repeated blocks, loops, and watcher integration remain deferred.
- Expansion work is charged before allocating repeated group output; final policy attachments are counted before deduplication. Group definitions and schedule entries count as declarations too.

## Architectural Issues / Deviations

- Object mapping keys need explicit provenance because value origins alone cannot identify an invalid imported computed key.
- Existing schedule handler errors carry only a message, losing which imported cadence/payload value failed validation. The generic compiler cannot infer this without platform-specific branches. Use the standard `Error.cause` to identify an exact supplied call/argument record (`{ value, index? }`), document this optional diagnostic convention on the existing Core handler contract, and have Bun attach it at its owning validators. Untagged adapter errors keep the existing statement fallback. No registry schema, required callback API, or Core runtime change is introduced.

## Expected Behavior / Not Expected Yet

- Expected now: reusable static middleware collections/mappings and schedule targets, payloads, cadence values, and modifiers.
- Not expected: helper calls, additional callback body statements, repeated blocks, loops, or complete imported-dependency HMR.

## Regression Checks

- Compiler package test command now includes Milestone 17.
- Final compiler checkpoint covers discovery, constructor/method plans, generated registries/contracts, middleware policies, events, static resolution, and Milestone 16 metadata.
- Dependent checkpoint covers existing Bun scheduler compiler/runtime/process behavior and Electrobun generated/managed middleware.

## Known Limitations / Blockers

- Mutation checking remains bounded/conservative. No blockers.

## Next Work Within This Milestone

- None. Next: Project Milestone 18 — static policy helpers across files.
