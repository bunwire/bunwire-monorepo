# Milestone 18 — Static Policy Helpers Across Files

Status: Complete

## Packages Changed

- `@bunwire/vite` compiler analysis and focused tests/fixtures.
- `@bunwire/core`, `@bunwire/bun`, and `@bunwire/electrobun` documentation for the shared compile-only policy behavior; no runtime API change.

## Implemented

- Started from the completed Milestone 17 policy and static-expression foundation.
- Shared compiler helper expander resolves reached functions/aliases, binds typed registry and static parameters, walks local `const` declarations and nested calls, and feeds existing middleware/schedule validators.
- Static value resolution accepts scoped helper bindings while retaining the shared session limits, canonical class symbols, imported source guard, and mutation checks.
- Imported middleware and billing schedule helper fixtures, generated-output equivalence, named callback, no-execution, and type-level tests are in place.
- Helper-generated middleware executes through Electrobun and a generic adapter; helper-generated schedules deliver the expected payload in a real Bun scheduler process.
- Reached helper values carry call paths through later group, Controller pattern, schedule, and adapter validation. Exact Core policy method symbols remain safe metadata consumers even in dormant sibling helpers; counterfeit same-name methods remain rejected.

## Remaining

- None for Milestone 18. Repeated policy blocks, bounded loops, and complete watcher integration remain assigned to later milestones.

## Acceptance Criteria

- [x] Domain helper files compose both policy types without runtime execution.
- [x] Expansion preserves canonical identity, lexical bindings, source order, and validation.
- [x] Unsupported constructs produce precise call-path diagnostics.
- [x] Required tests and dependent checks pass and are recorded.

## Tests Added / Tests Run / Test Results

- `tests/milestone-18/policy-helpers.test.ts` and `tests/fixtures/milestone-18-policy/` cover imported/re-exported helpers, named callbacks, nested calls, lexical constants, generated equivalence, a no-execution sentinel, and public type examples.
- Initial focused run: 5 passed, 1 failed. The failure came from an unrelated Bun package type diagnostic included by a test that scanned all imported package files; narrowed that assertion to the helper fixture source files.
- Expanded first run: 25 passed, 1 failed (26 total). The failing imported-value case exposed lost call-path context after policy syntax expansion; helper paths now travel with policy values.
- Runtime-expanded run: 29 passed, 0 failed, covering actual middleware and Bun scheduler execution.
- Focused source/path regression: 4 passed, 30 filtered (same-file dormant helpers, counterfeit methods, imported origins, depth budget).
- Focused semantic-path regression: 2 passed, 34 filtered (schedule validation, group cycle, Controller mapping).
- Focused imported/named callback regression: 2 passed, 36 filtered.
- The legacy middleware policy rejection fixture now positively covers named callbacks and local `const` values, which became supported in this milestone; repeated callbacks remain rejected.
- Full Milestone 18 run: **38 passed, 0 failed** (`.cache/milestone-18-complete-candidate.json`). The later callback-local function case passed separately (**1 passed, 38 filtered**, `.cache/milestone-18-local-functions.json`), and the later lexical-capture case passed separately (**1 passed, 39 filtered**, `.cache/milestone-18-lexical-closure.json`). All **40 current cases** have passed.
- `pnpm typecheck`: passed after policy value/path integration.
- `pnpm check:boundaries`: passed.
- Final affected adapter checkpoint: **5 files passed, 40 tests passed, 0 failed** (`.cache/milestone-18-adapters-final.json`), covering Bun scheduler compiler/runtime/process behavior and Electrobun managed/generated middleware.
- Migrated legacy callback fixture: **14 passed, 0 failed** (`.cache/milestone-18-legacy-callback.json`).
- Final test-source TypeScript check: `pnpm exec tsc -p tsconfig.tests.json --noEmit --pretty false` passed with all 40 current Milestone 18 cases present.
- Final `pnpm --filter @bunwire/vite test --reporter=dot --reporter=json --outputFile=D:/Projects/GitHub/bunwire/bunwire-monorepo/.cache/milestone-18-vite-final.json`: **21 files passed, 339 tests passed, 0 failed**. The runner collected 39 Milestone 18 cases before the lexical-capture test was added; that one passed separately as recorded above.
- `pnpm build`: passed for all workspace packages and both Bun/Electrobun examples.
- `pnpm test:built-exports`: passed public runtime/declaration export allowlists for all release packages.

## Important Decisions

- Reuse one analysis-local static-expression session and the existing policy validators. Helper bodies are compiler syntax, never imported or invoked.
- Keep the once-only Application policy boundary. Multiple blocks and loops belong to Milestones 19 and 20.
- Support synchronous block-bodied function declarations and `const` arrow/function expressions, including reachable local functions. Parameters are identifiers with exact positional arity; registry capability can only flow through direct helper arguments.

## Architectural Issues / Deviations

- Milestone 17 mutation analysis treated an unexpanded helper's `registry.group(...)` or `schedule.job(...)` in the same imported file as an arbitrary escape when another helper consumed the same collection. This contradicted the goal that ordinary, unreached helper bodies remain unaffected. The compiler now permits only exact TypeScript method symbols exported by Core's typed policy registry/builder contracts as known metadata consumers; it retains exact-site registration for reached calls. A selectively reached helper beside an unused one, a counterfeit same-name method, and prior mutation regressions passed.

## Expected Behavior / Not Expected Yet

- Typed policy helpers across project-local files and aliases generate the same records as equivalent inline declarations. Named callbacks, nested/local helpers, lexical captures, canonical middleware identities, and Bun schedule execution work.
- Not expected: arbitrary factories, runtime control flow, multiple policy blocks, loops, or complete dependency watcher integration.

## Regression Checks

- `@bunwire/vite` package test command includes Milestone 18. Final package checkpoint passed across earlier compiler milestones and the new helper suite: 21 files, 339 tests.
- Affected Bun schedule and Electrobun middleware regression checkpoint passed: 5 files, 40 tests.
- Workspace package and example build plus built public-export audit passed.

## Known Limitations / Blockers

- None.

## Next

- Project Milestone 19 — compose repeated Application middleware and schedule policy blocks.

## Post-Completion Review Fix — 2026-10-27

- Restricted callable local policy declarations to direct arrow/function expressions or aliases resolving to supported helpers. An arbitrary initializer call that returns a function now receives a policy diagnostic instead of being silently ignored; local helper aliases remain accepted.
- Added middleware and schedule regression cases asserting the diagnostic at the initializer and a positive local helper-alias case. The focused callable/alias selection passed 4 tests (39 filtered). The complete Milestone 18 suite passed 43/43 after the final helper change. Before the alias-preservation adjustment, the affected Milestone 18/21/22 suites passed 57/57 tests across 6 files.
- Final `pnpm quality` passed after the alias adjustment: package boundaries, typecheck, Electrobun SDK contract, full Vitest suite, all workspace builds, and built-export audit.
- The milestone's original acceptance and test history above remain the record of its completion at that checkpoint.
