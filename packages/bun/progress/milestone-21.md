# Milestone 21 — Command UX

Status: Complete

## Packages Changed

- `@bunwire/bun`

## Implemented

- Compiler-preserved command examples and richer global/per-command help from generated metadata.
- Backward-compatible base command I/O with deterministic table, progress, status, and explicit prompt helpers in command context.
- Typed usage failures, guarded default TTY input, and `--`-aware help handling.

## Remaining

- None.

## Acceptance Criteria

- [x] Users can discover and run generated commands from complete help output.
- [x] Scripts retain deterministic noninteractive execution and existing exit codes.

## Tests Added

- `tests/bun/milestone-21/commands-compiler.test.ts` — generated examples and help metadata validation.
- `tests/bun/milestone-21/commands-runtime.test.ts` — help, output helpers, prompt, noninteractive fallback, parser and cleanup behavior.
- `tests/bun/milestone-21/commands-process.test.ts` — CI process exits with open stdin and fallback behavior.

## Tests Run

- Final `pnpm exec vitest run tests/bun/milestone-21` — 9 passed across 3 files.
- `pnpm exec vitest run tests/bun/milestone-21/commands-process.test.ts` — 2 passed.
- `pnpm exec vitest run tests/bun/milestone-14` — 17 passed across 4 files.
- `pnpm typecheck` — passed before process tests were added.
- `pnpm --filter @bunwire/bun build` — passed after correcting the usage error class type.
- `pnpm exec vitest run tests/bun/milestone-21 tests/bun/milestone-14` — 26 passed across 7 files.
- Final `pnpm typecheck`, `pnpm --filter @bunwire/bun build`, `pnpm test:built-exports`, and `pnpm check:boundaries` — passed.
- `git diff --check` — passed.

## Test Results

- All required Milestone 21 tests and affected command regressions pass. Typecheck, Bun build, export audit, and boundary checks pass.

## Regression Checks

- Existing Milestone 14 parser, built-in command, generated compiler, and Bun child process tests pass.
- The broader Bun suite was not rerun because changes are confined to command metadata/runtime and the targeted command suites passed.

## Expected Behavior

- Global and per-command help expose generated metadata. Handlers receive plain output helpers and may explicitly request input; scripts either use a declared fallback or return usage code 2.

## Not Expected Yet

- Automatic prompting for missing CLI arguments or terminal control sequences.

## Important Decisions

- Prompts require an explicit handler call; output helpers use deterministic plain text.
- Existing `BunCommandIO` writers retain their two required callbacks; command contexts receive guaranteed helpers.
- Default terminal input is disabled when stdin/stdout are not TTYs or CI is set. Injected I/O can explicitly simulate interaction.

## Architectural Issues

- None identified.

## Known Limitations

- None identified.

## Blockers

- None.

## Next Work Within This Milestone

- None. Milestone 22 is next in `MILESTONES-v2.md`.
