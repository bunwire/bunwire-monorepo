# Milestone 24 — Cross-Feature Hardening and v2 Compatibility

Status: Complete

## Packages Changed

- `@bunwire/bun` WebSocket codec and documentation; `examples/bun-app`; real Bun tests; architecture and project progress documentation.

## Implemented

- Extended the existing Bun example with signed authenticated rate-limited reports, multipart validation with page errors, protected partial/deferred pages, health/maintenance control, same-registry command inspection, and typed authorized channels.
- Added real Bun integration coverage for all six required combined flows.
- Reviewed the security boundaries and corrected outgoing envelope JSON round-trip validation.
- Added an optional separate SSR bundle to the runnable example and preserved client-rendered behavior by default.
- Updated the old compatibility assertion to include the intentional `@bunwire/bun/react/server` entry introduced in Milestone 22.
- Updated the compiler fixture's exact class list for the three new example managed classes.
- Verified the existing registry schema, page protocol default, queue envelopes, and session persistence contracts remain unchanged.

## Remaining

- None for Milestone 24. The optional backends and provider presets remain outside the v2 plan.

## Acceptance Criteria

- [x] Every v2 feature is documented, tested, integrated, and accurately recorded.
- [x] No known regression or package-boundary violation remains concealed.
- [x] New conveniences work with the established bootstrap and first-plan APIs.

## Tests Added

- `tests/bun/milestone-24/example-process.test.ts` and its Bun WebSocket client exercise the integrated example.
- Milestone 23 codec regression covers a validator that accepts a payload omitted by JSON encoding.
- The Milestone 1 compiler fixture now recognizes the expanded integrated example.

## Tests Run

- `pnpm --filter @bunwire/example-bun-app build` — passed after adding the combined routes.
- `pnpm exec tsc -p tsconfig.tests.json --noEmit --pretty false` — passed.
- Focused Milestone 24 process test — 2 passed after correcting command inspection to reuse the main application's registry and bootstrap.
- Milestone 23 codec unit tests — 10 passed after the round-trip fix.
- Milestone 16 integrated process and Milestone 23 real WebSocket process regressions passed; the combined run exposed a stale Milestone 16 export assertion, now updated.
- `pnpm exec vitest run --config vitest.config.ts tests/bun/milestone-16/compatibility.test.ts` — 3 passed after updating the export assertion.
- `pnpm check:boundaries` — passed.
- `pnpm typecheck` — passed.
- `pnpm --filter @bunwire/bun build` — passed.
- `pnpm --filter @bunwire/bun test` — 363 passed, 2 failed in 77 files at the final broad checkpoint. The failures were the Milestone 1 exact example-class fixture and a Milestone 9 Vite HMR test that exceeded its 20-second limit under load.
- `pnpm exec vitest run --config vitest.config.ts tests/bun/milestone-01/bun-compiler.test.ts tests/bun/milestone-09/vite-pages.test.ts` — 7 passed after updating the fixture, with the Vite test passing under its original timeout.
- `pnpm test:built-exports` — passed for all release packages.
- `pnpm test:release-pack` — passed tarball content, manifests, isolated typechecks, and ESM imports for all release packages.
- `pnpm test:clean-install` — passed frozen-lockfile install and workspace typecheck.
- Documented example commands `command:demo`, `command -- routes:list`, `scheduler:demo`, and `worker:demo` — all exited 0; the Milestone 24 real process test covered HTTP, WebSocket, maintenance, and shutdown.

## Test Results

- The first focused process run passed the combined HTTP/WebSocket flow and exposed that the separate command example has only its own command registry. The new `inspect.ts` reuses the main registry; the focused rerun passed both tests.
- The final broad Bun checkpoint did not exit cleanly: one exact fixture had to be updated for new example classes, and one existing Vite HMR test timed out while the suite ran concurrently. Both files passed in a focused rerun. No remaining failing focused test is known; the broad suite was not repeated solely to clear that load-sensitive timeout.

## Regression Checks

- Milestone 16 example process, Milestone 23 WebSocket process/codec, Milestone 1 compiler, Milestone 9 Vite pages, and Milestone 16 public exports passed in focused runs.
- Boundary, workspace typecheck, Bun and example builds, built exports, release tarballs, and clean install passed.
- The broad Bun run covered all 77 files once and exposed the two results above; no repository-wide run was required because no shared Core/compiler infrastructure changed.

## Expected Behavior

- The existing Bun application can opt into signed authenticated throttled routes, validated uploads and page errors, partial/deferred authorized pages, maintenance/health controls, generated route inspection, and typed authorized multi-client WebSocket channels without replacing its bootstrap.
- The React SSR example uses a separate server bundle only when enabled; default client rendering and page protocol 1 remain available.

## Not Expected Yet

- Optional durable session/queue/rate-limit backends, distributed scheduler locks, OAuth/OIDC presets, mail, notification/broadcast products, localization, storage/S3, and generic Core extraction deferred by `MILESTONES-v2.md`.

## Important Decisions

- The existing Bun example remains the primary runnable demonstration; focused fixtures cover flows that would make it unwieldy.
- Run the broader Bun suite once at the final checkpoint, as required by Milestone 24.
- `inspect.ts` switches the existing bootstrap to the command role rather than duplicating its HTTP configuration.
- The outgoing WebSocket envelope correction stays within the opt-in codec; no wire protocol version or persistence schema changed.

## Known Limitations

- The example's fallback secrets and process-local memory queue, rate limiter, and maintenance state are development demonstrations. Production applications must supply independent secrets and appropriate durable/distributed backends.
- File MIME checking uses client-declared metadata, not content sniffing; signing-key rotation invalidates prior links.
- The broad Bun checkpoint had a Vite HMR timeout under parallel load, although that test passed when rerun with its original timeout. See Test Results.

## Blockers

- None.

## Next Work Within This Milestone

- None.
