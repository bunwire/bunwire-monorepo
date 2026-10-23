# Milestone 15 — Shared Static Expression Resolver

Status: Complete

## Packages Changed

- `@bunwire/vite` — internal static expression infrastructure.
- Repository tests and compiler documentation.

## Implemented

- Internal tagged values/references, constant/import/re-export lookup, supported operators and collection composition.
- Source provenance, intermediate re-export dependencies, canonical filesystem containment, bounded cache accounting.
- Alias/property mutation and value-escape detection, with ordinary scalar runtime usage allowed.
- Direct resolver fixtures, external side-effect sentinel, exact budget checks, and architecture assertions.

## Remaining

- None for Milestone 15. Consumer integration is Milestone 16.

## Acceptance Criteria

- [x] Equivalent supported expressions produce equivalent values and preserve canonical references.
- [x] Dependencies/provenance include intermediate re-export files.
- [x] Errors identify unsupported expressions and reference chains.
- [x] No application execution; bounded termination.
- [x] Required tests pass and results are recorded.

## Tests Added

- `tests/milestone-15/static-expression.test.ts` and real Program fixtures under `tests/fixtures/milestone-15-static-expressions/`.
- Unit coverage: all primitive/wrapper/operator forms, finite arithmetic, collection nesting/spreads/overwrite precedence, computed/special keys, own reads, and sparse-array rejection.
- Compiler fixtures: imports, aliases, namespaces, named/star/local/default re-exports, lexical shadowing, canonical class/token identity, and counterfeit data separation.
- Rejection fixtures: cycles, mutable/ambient/type-only declarations, detected alias/property/destructuring/spread/assignment/namespace writes, mutating calls and constructor escapes, arbitrary calls/getters, coercion, dependency packages, direct source escapes, and escaping filesystem links.
- Behavioral coverage: an external sentinel proves top-level parsed application-module effects are never executed.
- Budget coverage: exact and exceeded depth 64, nodes 100,000, and declarations 10,000; repeated cache hits cannot evade work/depth limits and preserve dependencies/use-site diagnostics.
- Architecture coverage: internal-only exports, no application evaluation mechanism, and no Core dependency on TypeScript/tooling. Added the suite to the Vite package test script.

## Tests Run / Test Results

- Initial `pnpm --filter @bunwire/vite typecheck`: failed with two related errors narrowing variable declaration parents; corrected. Rerun passed.
- Initial `pnpm exec vitest run tests/milestone-15`: 42/42 passed.
- Expanded resolver runs passed 49/49 and then 52/52 tests as coverage grew.
- Focused exact-depth/cache accounting tests passed 2/2 (47 unrelated tests intentionally filtered).
- Namespace-write regression initially passed dot access but failed computed access; TypeScript does not expose the element-access node's symbol. Fixed by resolving the known syntax key to its canonical property symbol; both pass in the final suite.
- Final `pnpm exec vitest run tests/milestone-15`: **54 passed, 0 failed, 0 skipped** (1 file).
- After making the wrapper fixture valid TypeScript and explicitly covering type assertions/non-null wrappers, `pnpm exec vitest run tests/milestone-15/static-expression.test.ts -t 'primitives'`: **1 passed, 53 intentionally filtered, 0 failed**.
- `pnpm exec vitest run tests/milestone-00/architecture.test.ts tests/milestone-07 tests/milestone-08 tests/milestone-09`: **52 passed, 0 failed, 0 skipped** (4 files).
- Final `pnpm typecheck`: passed (workspace project builds plus test typechecking).
- `pnpm check:boundaries`: passed.
- Final `pnpm --filter @bunwire/vite build`: passed.
- `git diff --check`: passed; Git reports normal LF/CRLF conversion notices on this Windows checkout.
- No outstanding failures. Passing unrelated tests were not repeated. No full suite/native smoke run: the resolver is not wired into consumers and changes no runtime behavior.

## Important Decisions

- Resolver remains internal to compiler tooling; metadata integration starts in Milestone 16.
- No changes to Core, config parsing, adapter discovery, or Application composition-root syntax.
- Static values are immutable tagged trees; reference leaves carry actual TypeScript symbols, never class-name strings. Callers must retain existing authorization and metadata validation.
- Cache replay charges evaluated work and depth at each use site. Limits are fixed per resolver session: depth 64, 100,000 nodes, and 10,000 emitted declarations.
- Mutation checks examine project-local non-declaration files already loaded in the Program, follow bindings and structural aliases, and reject calls that could mutate/escape consumed collections. This does not analyze arbitrary function bodies for effects.

## Expected Behavior

- Direct TypeScript-program fixtures exercise the supported static grammar, dependency/provenance snapshots, and fixed budgets without importing application modules.
- Constants resolve from source through local/imported bindings, wrappers, namespace lookups, and re-export chains. Collections preserve source order, safe own keys, and exact class/token symbol identity.
- Unsupported operations fail with source locations and reference paths rather than executing code or silently falling back.

## Expression Grammar and Unsupported Cases

- Values: strings, finite numbers (including separators), booleans, null, undefined, arrays, objects, and separate canonical reference leaves.
- Wrappers: parentheses, type assertions, `as const`, `satisfies`, and non-null assertions are unwrapped without treating types as runtime values.
- Composition: known array/object spreads; explicit/shorthand/computed object properties; own-property/index/length reads; later object properties/spreads overwrite earlier keys.
- Operators: finite numeric unary `+`/`-`, numeric `+`/`-`/`*`/`/`/`%`/`**`, and string-only concatenation.
- Unsupported: arbitrary calls/factories, `new` as static data, getters/setters/object methods, sparse arrays, missing/prototype properties, non-string/number computed keys, ambient/type-only/mutable values, mixed coercion, non-finite arithmetic, source escapes, and ordinary dependency-package initializers. Helpers/loops are later milestones.

## Not Expected Yet

- Expanded syntax in metadata consumers, helpers, repeated policy blocks, loops, or full HMR dependency integration.

## Known Limitations

- Mutation detection is bounded to the analyzed graph; generated metadata is an initializer snapshot, not proof of runtime immutability.
- Structural alias, unknown collection call, and escape checks are conservative. They do not execute functions or prove arbitrary code free of effects; later runtime mutation cannot reconfigure generated metadata.

## Architectural Issues / Blockers

- None.

## Regression Checks

- Existing config/bootstrap discovery, canonical compiler symbol and DI authorization, managed parameter plans/caller indexes, and package boundaries: 52 passing regression tests.
- All affected workspace types and examples still compile through root typechecking; Vite builds successfully. No Core or adapter runtime changes were required.

## Next Work Within This Milestone

- None. Next: Milestone 16 — integrate this resolver into managed metadata consumers while retaining canonical authorization and feature validators.
