# Bun source layout maintenance — 2026-10-23

Status: Complete. Milestones 1–24 remain complete; this is a post-completion source-only reorganization.

## Scope and decision

- Moved `@bunwire/bun` implementation modules into `foundation/`, `http/`, `security/`, `pages/`, `jobs/`, `scheduling/`, `commands/`, `websocket/`, and `testing/` under `packages/bun/src`.
- Kept the five public source entrypoints in place. `client.ts`, `react.ts`, `react-server.ts`, and `testing.ts` now reexport their feature modules. `index.ts` continues to export the same public symbols directly from their new paths.
- Updated internal relative imports and the six Bun tests that imported internal source files. No package export map, API, lifecycle, or generated schema was intentionally changed.
- Regenerated the tracked Bun example registries. Their middleware definition order, import IDs, and registry hashes changed with compiler discovery over the new source paths; the main example build succeeds.

## Verification

- `pnpm exec tsc -b packages/bun/tsconfig.json` — passed after clearing stale Bun build output.
- `pnpm --filter @bunwire/bun test` — all 77 test files and 370 tests passed. Vitest exited 1 because a Vite HMR callback reported `CONFIG_NOT_FOUND` after its temporary fixture directory was removed.
- Focused Milestone 9 Vite pages test — 5 tests passed, exit 0.
- `pnpm typecheck` — passed.
- `pnpm check:boundaries` — passed.
- `pnpm test:built-exports` — passed for all release packages.
- `pnpm test:release-pack` — passed tarball contents, isolated typechecks, and ESM imports.
- `pnpm --filter @bunwire/example-bun-app build` — passed, including client and SSR builds.

## Expected behavior and limitations

The package's public import paths and Bun runtime behavior remain available. Internal `src/` file paths changed and are not public APIs. The broad Bun run's Vite HMR teardown rejection remains a test-harness issue to investigate if it recurs; the test's assertions passed in both broad and focused runs. No milestone requirement remains open from this reorganization.
