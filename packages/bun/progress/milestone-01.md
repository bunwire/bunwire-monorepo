# Milestone 1 — Package Foundation, Bun Adapter, and Runtime Roles

Status: Complete

## Packages Changed

- `packages/core`
- `packages/bun`
- `packages/vite`
- `packages/electrobun` workspace dependency metadata
- `examples/bun-app`
- workspace configuration, boundary checks, release audits, tests, and documentation

## Implemented

- Added terminal Core `Application.stop()` with `stopping` and `stopped` states, concurrent/idempotent cleanup, stop-during-startup behavior, invocation rejection after stopping begins, and deterministic failure states.
- Added the protected adapter `stopHost(context)` hook and exactly-once Core cleanup dispatch.
- Added startup rollback after host context preparation, preserving startup failures and aggregating cleanup failures.
- Created public `@bunwire/bun` version `0.1.1`, depending only on `@bunwire/core` at runtime.
- Added validated, immutable `http`, `worker`, `scheduler`, and `command` runtime roles; the default is `http`.
- Added the canonical empty `bun.adapter` compiler descriptor and a generated-runtime-registry consumer that must complete before host startup.
- Added frozen role-only runtime context and rejected manual `Application.withContext()` for the primary Bun adapter path.
- Added default SIGINT/SIGTERM handling with graceful `app.stop()`, handler removal, native signal re-raise, second-signal termination, opt-out support, and preservation of unrelated listeners.
- Added the minimal `examples/bun-app` composition-root/entrypoint split and deterministic empty generated registry/client artifacts.
- Moved the Bun roadmap to `packages/bun/MILESTONES.md` and retained the former documentation path as a redirect.
- Extended project references, aliases, lockfile, boundary checks, built-export audits, tarball audits, and clean-install coverage.
- Added deterministic empty caller-contract generation for adapters that intentionally declare no managed method kinds.

## Remaining

- None for Milestone 1.

## Acceptance Criteria

- [x] `@bunwire/bun` builds, typechecks, packs, and exposes its reviewed public API.
- [x] `BunAdapter` attaches to the existing Core Application and consumes the generated registry.
- [x] Runtime roles are explicit, immutable, and default to `http`.
- [x] Non-HTTP roles do not start HTTP resources.
- [x] Core owns deterministic startup, terminal shutdown, and startup-failure cleanup.
- [x] SIGINT/SIGTERM trigger graceful Core shutdown by default and can be disabled.
- [x] No runtime source/decorator discovery exists.
- [x] The minimal Bun application starts and terminates without hanging resources.
- [x] Required focused, package, workspace, release, and regression checks pass.
- [x] Documentation and progress records match the implemented behavior.

## Tests Added

- Core lifecycle coverage for terminal shutdown, concurrent/idempotent stop, stop during startup, invocation rejection, cleanup ordering/exactly-once behavior, rollback, aggregate failures, and default adapter compatibility.
- Bun adapter coverage for attachment, roles, validation, frozen context, descriptor identity, registry ordering, manual-context rejection, absent HTTP startup, and signal handler ownership.
- Bun compiler coverage for descriptor discovery and deterministic empty generated contracts.
- Real Bun-process coverage for normal start/stop and SIGINT/SIGTERM cleanup followed by native re-raise.
- Package-boundary regression coverage for Core-to-Bun dependency violations.

## Tests Run

- `pnpm exec vitest run tests/milestone-04/application-kernel.test.ts tests/milestone-06/adapter-extension.test.ts`
- `pnpm --filter @bunwire/bun test`
- focused Core, Vite/compiler, and Bun verification: 6 files / 86 tests
- `pnpm --filter @bunwire/example-bun-app build`
- `pnpm typecheck`
- `pnpm check:boundaries`
- `pnpm test`
- `pnpm build`
- `pnpm test:built-exports`
- `pnpm test:release-pack`
- `pnpm test:clean-install`
- `pnpm quality`

## Test Results

- Focused Core lifecycle: 2 files / 50 tests passed.
- Bun package: 3 files / 14 tests passed.
- Combined focused verification: 6 files / 86 tests passed.
- Full Vitest suite: 40 files / 397 tests passed.
- Typecheck, boundaries, Bun example build, full workspace build, built exports, release tarballs, isolated package consumers, clean frozen-lockfile install, and final quality gate passed.
- Failed: 0 in the final verification run.
- Skipped: 0.
- Known warning: Vite reports the existing intentional dynamic Electrobun import during the workspace build; it is non-failing and unrelated to Bun Milestone 1.

## Regression Checks

- Existing adapters remain compatible through the default no-op cleanup hook.
- Core has no Bun dependency or platform-specific signal behavior.
- Vite has no hard-coded Bun managed concepts and accepts an intentionally empty adapter descriptor generically.
- Cross-package source imports and Bun runtime filesystem discovery remain forbidden.
- Existing Core, Vite/compiler, Electrobun, examples, exports, packages, and clean-install gates pass.

## Expected Behavior

After this milestone:

- A Core Application can attach `BunAdapter`, receive a generated registry, start under one immutable runtime role, and terminate through `app.stop()`.
- `Application.stop()` is terminal, idempotent after successful cleanup, and shares exactly-once adapter cleanup across concurrent calls.
- Host context prepared before a startup failure is cleaned up exactly once.
- Bunwire-installed signal handlers clean up through Core and then restore native signal termination semantics.

## Not Expected Yet

- HTTP controllers or `Bun.serve()` startup.
- Bun execution-scope kinds or active-scope draining.
- Form Requests, sessions, CSRF, authentication, pages, jobs, scheduling, commands, or WebSockets.
- Provider disposal or container disposal.

## Important Decisions

- `BunAdapter` follows Core's class-based primary-host adapter model and owns normal context preparation.
- `app.stop()` is the sole public shutdown boundary and is terminal; stopped applications cannot restart.
- Registry delivery is an explicit prerequisite to host start, with no runtime scanning fallback.
- Empty compiler descriptors produce deterministic empty caller contracts without weakening validation for adapters that declare managed method kinds.
- Internal workspace Core dependencies use `workspace:^` so local adapters compile and test against the repository's authoritative Core implementation; publication rewrites the protocol to a semver range.

## Known Limitations

- Active invocation draining and scoped resource disposal are deferred to Milestone 2.
- Bun 1.3.14 on Windows does not route externally delivered child-process signals through JavaScript handlers. The behavioral tests therefore exercise signal emission inside a real Bun child and verify cleanup plus native re-raise; Unix-compatible exit semantics remain supported by the assertions.

## Blockers

- None.

## Next Work Within This Milestone

- None. Milestone 1 is complete.
