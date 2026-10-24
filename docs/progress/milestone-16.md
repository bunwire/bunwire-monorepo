# Milestone 16 — Expressions Throughout Managed Metadata

Status: Complete

## Packages Changed

- `@bunwire/vite`: shared resolver integration into managed metadata.
- `@bunwire/bun` and `@bunwire/electrobun`: documentation only; runtime code unchanged.
- Compiler fixtures, integration tests, and documentation.

## Implemented

- Shared per-analysis metadata session, immutable materialization, deferred mutation validation, exact authorized decorator consumption sites, and protected-property mutation tracking.
- Registered decorator/injector options, attachments, compiled protected fields, Event aliases, middleware aliases/filters, and individual string-valued `@Use()` expressions now use the resolver.
- Added generic adapter, Electrobun, and Bun fixtures, byte-identical generation comparison, runtime tests, and negative schema/identity/mutation cases.
- Migrated previous literal-only rejection cases into positive coverage without removing unsupported-expression/placement/identity checks.
- Preserved literal parsing for central policies and safe computed emission of `__proto__` metadata keys.

## Remaining

- None for Milestone 16. Milestone 17 is next and has not started.

## Acceptance Criteria

- [x] Listed metadata consumers use consistent expression rules.
- [x] Imported queue/backoff/arithmetic examples compile and execute through generated runtime integration.
- [x] Canonical identity, schema validation, injection semantics, and mutation rejection remain intact.
- [x] Required tests and impacted package checks pass and are recorded.

## Tests Added

- `tests/milestone-16/managed-metadata.test.ts`, generated real-Bun child process, and fixtures under `tests/fixtures/milestone-16-static-metadata/`.
- Existing metadata/attachment rejection suites now positively cover supported constants, spreads, and noninterpolated template strings.

## Tests Run / Test Results

- Initial compiler package typecheck passed.
- Initial Milestone 16 suite: 5 passed, 1 failed due to incorrect test setup using the root container before startup. Corrected fixture setup and resolver parameter access; focused fake-adapter runtime rerun passed (1 passed, 5 filtered).
- Initial workspace typecheck reported two fixture/test API mistakes (incorrect resolver request data access and a nonexistent `bindValue` method); corrected to `parameter.data` and `Container.value`. Subsequent `pnpm typecheck` passed.
- Expanded `pnpm exec vitest run tests/milestone-16`: 19 passed, 0 failed (before final special-key/no-execution additions).
- `pnpm exec vitest run tests/milestone-12b/middleware-metadata-invalid.test.ts tests/milestone-12c/middleware-attachments-invalid.test.ts tests/milestone-15`: 92 passed, 0 failed across 3 files.
- Expanded milestone suite including special keys and no-execution: **21 passed, 0 failed**. The new semantic client contract check separately passed (**1 passed, 21 filtered**), including required id, string type, and rejected injected caller arguments.
- `pnpm typecheck` passed after the expanded fixture changes.
- `pnpm check:boundaries` passed.
- Imported include/exclude/only/except and resolved invalid Bun timeout checks passed (**2 passed, 22 filtered**).
- Computed-key protected-property mutation regression plus affected standalone mutation/namespace/scalar checks passed (**20 passed, 59 filtered**, 2 files). A first filtered command supplied two `-t` flags and was rejected before test execution; the corrected combined pattern passed.
- Final `pnpm typecheck`, `pnpm --filter @bunwire/vite build`, and `pnpm check:boundaries`: passed on the final source.
- Earlier broad regression handles expired before their final summaries were retained. The cache showed no failures but was insufficient evidence of complete runs. Re-ran only these unresolved checkpoints with JSON reports under ignored `.cache/`: `milestone-16-vite.json` and `milestone-16-dependent.json`.
- Final retained Vite package checkpoint: **19 files passed, 262 tests passed, 0 failed, 0 skipped**, exit code 0. Its report confirms all **25 Milestone 16 tests passed**. Report: `.cache/milestone-16-vite.json`.
- Final retained dependent checkpoint: **9 files passed, 52 tests passed, 0 failed**, exit code 0. Covers Bun HTTP/middleware compilation, job compilation and real process execution, queued listeners, scheduling, generic class attachments, generated Electrobun clients, and architecture. Report: `.cache/milestone-16-dependent.json`.

Final retained-report commands:

```powershell
pnpm --filter @bunwire/vite test --reporter=dot --reporter=json --outputFile=D:/Projects/GitHub/bunwire/bunwire-monorepo/.cache/milestone-16-vite.json
pnpm exec vitest run tests/bun/milestone-11/jobs-compiler.test.ts tests/bun/milestone-11/jobs-process.test.ts tests/bun/milestone-12/queued-listeners-compiler.test.ts tests/bun/milestone-13/scheduler-compiler.test.ts tests/bun/milestone-03/http-compiler.test.ts tests/bun/milestone-04/http-middleware-compiler.test.ts tests/milestone-14/class-attachments-compiler.test.ts tests/milestone-12/generated-client-e2e.test.ts tests/milestone-00/architecture.test.ts --reporter=dot --reporter=json --outputFile=.cache/milestone-16-dependent.json
```

## Important Decisions

- One internal resolver session per Program analysis; no public API/configuration additions.
- Central middleware and schedule policies retain literal parsing until Milestone 17.
- Metadata is materialized as immutable data; class/token arguments retain their canonical authorization path.
- No application code, helpers, callbacks, or Provider lifecycle execution during compilation.

## Architectural Issues / Deviations

- The standalone resolver conservatively treats object arguments to calls as escapes. Integration must allow exact canonical decorator consumption sites before final mutation validation; arbitrary calls remain rejected.
- Integration identified a generator edge case: a plain `"__proto__"` object-literal key has special JavaScript semantics. Emit only that key with computed-property syntax to preserve own-property data. Materialization keeps ordinary object APIs while defining own keys safely. No Core or adapter runtime changes were needed.
- Protected metadata properties participate in alias/mutation analysis. An unresolved computed key on a receiver with consumed properties cannot bypass checks; candidate property symbol identities are inspected without treating inferred literal types as runtime key values.

## Expected Behavior / Not Expected Yet

- Registered class/method decorator options, parameter-injector options, class attachments, and protected compiled policy values accept the supported static language, including imported project-local constants outside discovery roots.
- Event and middleware aliases resolve from static strings; middleware include/exclude/only/except resolve known arrays; individual `@Use()` strings retain the existing alias/group/parameter validation and canonical middleware normalization.
- Generated Bun jobs receive the resolved queue, timeout, and retry/backoff policy in the actual invocation envelope. Electrobun RPC and generic-adapter invocation retain metadata agreement and independently indexed caller/injected parameters.
- Unsupported expressions and detected mutation produce compiler errors; compilation does not execute application modules or arbitrary helpers. Safe own object keys survive materialization and generation.
- Deferred: central policy composition, helpers, repeated blocks, loops, and watcher integration.

## Regression Checks

- Standalone resolver and migrated middleware metadata/attachment diagnostics: 92 passing tests, followed by focused mutation coverage after the computed-key hardening.
- Workspace types (including examples), compiler build, and package boundaries pass.
- Dependent adapters, generic class attachments, generated clients, and architecture: 52 tests pass across 9 files, confirmed by the retained report.
- Vite package checkpoint: 262 passing tests across 19 files. Together with the disjoint dependent checkpoint, **314 tests pass across 28 files**.
- Saved JSON reports were parsed and verified: success=true, zero failures, zero pending tests, and every file passed.
- Test teardown removed generated fixture directories; a guarded nonrecursive cleanup check found none remaining. `git diff --check` passes.
- No full monorepo/native smoke suite was repeated: the final checkpoint covers the changed compiler package and its relevant consumers.

## Known Limitations

- Mutation checking remains bounded to the analyzed graph and conservative about unknown effects.
- Unknown computed-key writes/calls on receivers with consumed properties are rejected conservatively, rather than trusting a type annotation as a runtime key value.

## Blockers

- None.

## Next Work Within This Milestone

- None. Next: project Milestone 17 — composable middleware and schedule values.
