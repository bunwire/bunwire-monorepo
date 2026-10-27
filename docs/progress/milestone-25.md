# Milestone 25 — Compiler-Backed Project Inspection

Status: Complete

## Packages Changed

- `packages/core` — pure inspection handler contract.
- `packages/vite` — public static inspection snapshot and validation.
- `packages/bun`, `packages/electrobun` — adapter-specific compiler descriptions.
- `packages/cli` — ten inspection commands, tables, and JSON output.

## Implemented

- Static inspection derives canonical classes, methods, events, listeners, schedules, middleware, and explicit Provider references from the existing compiler analysis.
- Bun, Electrobun, and generic adapters can describe their own class and method kinds through the same pure compiler metadata handler.
- All ten CLI commands have deterministic human and JSON output; errors remain on stderr.

## Remaining

- None.

## Acceptance Criteria

- [x] All ten inspection commands work before application startup in the Electrobun fixture.
- [x] Bun, Electrobun, Core, and generic adapter records are represented without concrete-adapter branches in the generic inspector.
- [x] JSON schema and stable ordering are documented and tested.
- [x] Existing Bun runtime list commands remain compatible and shared fields agree in focused parity tests.
- [x] Required tests and affected package checks pass.

## Tests Added

- `tests/milestone-25/project-inspection.test.ts`: all ten commands, Bun/Electrobun/Core/generic adapter records, static Providers, empty lists, alias identities, JSON output, errors, and runtime-list parity.

## Tests Run

- `pnpm exec vitest run tests/milestone-25/project-inspection.test.ts` — final focused run: 1 file, 8 tests passed after adding the human-table relationship column and middleware deduplication.
- Focused generic adapter, Bun categories, configured Providers, runtime route/job/event parity, and runtime schedule parity cases passed after test-fixture corrections.
- `pnpm typecheck` — passed for workspace packages and tests.
- `pnpm build` — passed for all workspace packages and Bun/Electrobun examples; generated example artifacts had zero content changes.
- `pnpm check:boundaries` — passed.
- `pnpm test:built-exports` — passed after adding the new Core type and compiler-only exports to the audit.
- `pnpm test:cli-pack` — passed; packed Node-only consumer inspected an Electrobun route without Vite or Bun installed.
- `pnpm test:release-pack` — passed for release package contents, isolated typechecking, and ESM imports.
- `pnpm exec vitest run tests/bun/milestone-14/commands-compiler.test.ts tests/bun/milestone-14/framework-commands.test.ts tests/milestone-12/middleware-compiler.test.ts` — 3 files, 13 tests passed.
- `pnpm --filter @bunwire/cli test` — final grouped run: 3 files, 19 tests passed. An earlier run passed 18 and failed one Milestone 24 watcher test because its log-count assertion raced the preceding successful refresh; the test now waits for that log.
- `pnpm --filter @bunwire/vite test` — 27 files, 400 tests passed.
- `pnpm typecheck` and `pnpm test:built-exports` — passed again after final inspector changes.
- `git diff --check` — passed.

## Test Results

- Passed: final CLI 19/19; Vite/compiler 400/400; dependent Bun/Electrobun cases 13/13; workspace typecheck/build; boundaries, built exports, packed CLI, and release package audits.
- Failed during development: one Milestone 24 watcher test log-count race in the first grouped CLI run. Its synchronized rerun passed in the final 19/19 result. Initial test-fixture expectations for a Bun job ID and schedule root were also corrected before the final Milestone 25 run.
- Skipped: only intentionally filtered cases in focused development runs; none in final package runs.

## Regression Checks

- Bun runtime route/job/event/schedule list fields agreed with compiler inspection in focused tests.
- Packed CLI inspection passed in an isolated consumer without Vite or Bun.
- Bun and Electrobun example builds passed without generated artifact changes.
- The Vite/compiler package suite passed 400/400 across 27 files; the CLI package suite passed 19/19 across 3 files.

## Expected Behavior

- Ten list commands read current compiled source facts without generating artifacts or starting the application. JSON items have stable canonical identities, relative source locations where available, scalar details, and related identities; human tables expose the same relationships. Explicit statically resolved Providers appear, while runtime bindings do not.

## Not Expected Yet

- Source generators, Bun command dispatch, or project scaffolding.

## Important Decisions

- Use the existing compiler analysis and adapter compiler descriptor, not runtime application imports.
- The JSON success envelope is version 1 with sorted canonical identities; compiler errors retain stderr diagnostics and no success envelope.
- Adapter middleware already appears as analyzed managed classes; inspection reuses those class records and links their compiled uses instead of adding duplicate descriptor rows.
- External package class identities use public module/export names so they do not depend on installation paths.

## Known Limitations

- None recorded yet.

## Blockers

- None.

## Next Work Within This Milestone

- None; Milestone 25 is complete. Project Milestone 26 is next.
