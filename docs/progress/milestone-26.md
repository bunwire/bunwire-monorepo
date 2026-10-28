# Milestone 26 — Core Source Generators

Status: Complete

## Packages Changed

- `@bunwire/cli` — six source generators, CLI options, help, package test script, and README.
- `@bunwire/vite` — public compiler Event export resolver used by Listener generation.
- Integration fixtures and packed CLI test.

## Implemented

- Six `make:*` commands generate Core Controller, Service, Provider, Middleware, Event, and Listener classes using public `@bunwire/core` imports.
- Commands use conventional kind folders beneath a configured source root; multi-root configs require `--source`.
- Listener generation requires an explicit project-relative `file#ExportName` and validates the export against canonical compiler-discovered Core Event identity, including re-exports.
- Middleware supports an optional alias, rejects existing application and adapter aliases, and explains explicit `@Use()` attachment. Provider templates separate startup `register()` bindings from invocation `boot()` work.
- Names, paths, source selection, destination containment, and exclusive file creation protect existing work. No generator edits bootstrap or starts the application.

## Remaining

- None.

## Acceptance Criteria

- [x] Six generators create compiling, compiler-discovered managed classes.
- [x] Middleware uses a valid Core handle signature and explains explicit attachment.
- [x] Providers use register/boot lifecycle semantics and call container entries bindings.
- [x] Listeners resolve an explicitly chosen canonical Event.
- [x] Names, paths, conflicts, and filesystem boundaries are validated without overwrites.
- [x] Bun and Electrobun fixtures work without startup or bootstrap edits.

## Tests Added

- `tests/milestone-26/core-source-generators.test.ts`: all six types in Bun and Electrobun fixtures, generated-source TypeScript diagnostics, canonical Event and re-export resolution, validation, alias conflicts, overwrite safety, source-root choice, and help/list output.
- Extended `tests/milestone-23/packed-no-vite.mjs` to exercise Core generators in an installed Electrobun consumer without Vite or Bun.

## Tests Run

- `pnpm --filter @bunwire/cli build` — passed.
- `pnpm --filter @bunwire/cli test` — 22 passed across Milestones 23–26.
- `pnpm exec vitest run --config vitest.config.ts tests/milestone-26/core-source-generators.test.ts -t "resolves an Event re-export"` — 1 passed, 3 skipped by filter.
- `pnpm typecheck` — passed.
- `pnpm exec tsc -p tsconfig.tests.json --noEmit` — passed after the new re-export test.
- `pnpm check:boundaries` — passed.
- `pnpm test:cli-pack` — passed after adding packed generator coverage.
- `pnpm test:built-exports` — passed.

## Test Results

- Passed: 23 distinct CLI/generator tests across the package run and the focused re-export run; TypeScript, package boundaries, packed Node consumer, and built export audit.
- Failed: None outstanding. Early fixture-copy and alias-assertion failures were corrected and their affected tests passed on rerun.
- Skipped: 3 existing tests during the targeted re-export run; they had passed in the earlier package run.

## Regression Checks

- CLI Milestones 23–25 passed in the package suite after parser changes.
- Packed CLI generation, inspection, scaffolding, and watch passed without Vite or Bun installed.
- Public built exports and package boundaries passed.

## Expected Behavior

- `bunwire make:<kind> ClassName` creates one typed Core source file in the conventional folder beneath the configured source root.
- `make:listener` requires an explicit canonical Event export reference. Middleware alias and `@Use()` attachment remain separate operations.
- A generated Controller has no endpoint until an adapter-defined managed method is added. Generated Event and Listener bodies require application data and reaction behavior.

## Not Expected Yet

- Bun-specific generators and runtime command dispatch (Milestone 27).

## Important Decisions

- Generate into conventional kind folders beneath the sole configured source root; require explicit source selection when multiple roots exist.
- Require a project-relative source file and named export for Listener Event selection.
- Keep TypeScript symbol resolution inside the public compiler boundary; the CLI consumes that boundary without importing application modules.
- Reject alias strings containing attachment parameter delimiters, and reject existing application/adapter middleware aliases before writing.

## Known Limitations

- The built-in Core templates are intentionally host-neutral. Generated Controller methods and application-specific Listener reactions must be supplied by the developer.

## Blockers

- None.

## Next Work Within This Milestone

- None. Begin Milestone 27 when requested.
