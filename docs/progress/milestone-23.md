# Milestone 23 — Executable and Physical Generation

Status: Complete

## Packages Changed

- `packages/vite` — public compiler-only entrypoint and optional Vite peer.
- `packages/cli` — Node-compatible Bunwire executable.
- Bun and Electrobun examples — generation scripts.

## Implemented

- Publishable `@bunwire/cli` package with Node `bunwire` executable, `help`, `list`, and `generate`.
- Public `@bunwire/vite/compiler` subpath and optional Vite peer; original API remains available.
- Explicit `--root` handling and compiler diagnostics on stderr with unsuccessful exit codes.
- Bun and Electrobun examples use the binary; Bun invokes it once per configured root.
- Release audits include the CLI package and a packed no-Vite Electrobun consumer.

## Remaining

- None.

## Acceptance Criteria

- [x] Publishable `@bunwire/cli` with `bunwire` binary, `help`, `list`, and `generate`.
- [x] Explicit single-project root resolution and useful diagnostics/exit codes.
- [x] Compiler-only generation works from Node without Vite or Bun installed.
- [x] CLI artifacts match the API and unchanged files retain modification times.
- [x] Failed analysis preserves prior artifacts; neighboring projects are not scanned.
- [x] Examples, affected package checks, and required tests pass at the final checkpoint.

## Tests Added

- `tests/milestone-23/cli-generation.test.ts`: six process-level cases for help/catalog, Electrobun and Bun generation, API parity, unchanged timestamps, root isolation, errors, artifact preservation, and no source execution.
- `tests/milestone-23/packed-no-vite.mjs`: packed CLI/compiler/Electrobun consumer without Vite or Bun.

## Tests Run

- `pnpm exec vitest run tests/milestone-23/cli-generation.test.ts` — 6 passed.
- `pnpm test:cli-pack` — passed; packed consumer generated Electrobun artifacts without Vite or Bun.
- `pnpm exec vitest run tests/milestone-12/virtual-modules-vite.test.ts tests/milestone-21/dependency-watching.test.ts` — 4 passed.
- `pnpm check:boundaries` — passed.
- `pnpm test:built-exports` — passed.
- `pnpm test:release-pack` — passed with CLI included.
- `pnpm build` — passed for all workspace packages and examples.
- `pnpm typecheck` — passed.
- `pnpm test` — 134 test files and 1,033 tests passed.

## Test Results

- Passed: 1,033 tests in the broad suite, 6 focused CLI tests, 4 focused Vite regression tests, packed no-Vite consumer, package audits, boundary check, workspace build, and typecheck.
- Failed: none in the final checks. An initial focused test run failed because the new Vite alias was ordered after the broader alias; the alias order was fixed and all six focused tests passed.
- Skipped: none recorded.

## Regression Checks

- Vite artifact and dependency watcher tests passed.
- Bun and Electrobun examples built with the CLI and reported zero artifact changes.
- Package boundary, public export, and packed-release audits passed.
- Full workspace suite passed: 134 files and 1,033 tests.

## Expected Behavior

- `bunwire generate` updates physical artifacts for exactly one configured project and preserves unchanged file timestamps.
- `bunwire help` and `bunwire list` run without a project configuration.

## Not Expected Yet

- Standalone watch, compiler inspection commands, source generation, Bun operation dispatch, or project creation.

## Important Decisions

- Keep analysis and artifact generation in `@bunwire/vite`; expose a compiler-only public subpath instead of duplicating it in the CLI.

## Known Limitations

- The command catalog contains only implemented Milestone 23 commands; later milestone commands are not advertised as available.

## Blockers

- None.

## Next Work Within This Milestone

- None. Begin Milestone 24 in its own progress file when standalone watch implementation starts.
