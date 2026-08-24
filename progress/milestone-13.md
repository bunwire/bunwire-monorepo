# Milestone 13 — Hardening and First Release

Status: Complete

## Release Target

- Prepare `@bunwire/core`, `@bunwire/vite`, and `@bunwire/electrobun` version `0.1.0` for publication.
- Do not publish packages, create a Git tag, create a GitHub release, or require release credentials.

## Packages Changed

- `packages/core`
- `packages/vite`
- `packages/electrobun`
- `examples/electrobun-app`
- promoted fake-queue example
- repository release tooling, documentation, tests, and progress records

## Acceptance Criteria

### Architecture

- [x] Core contains no Vite import.
- [x] Core contains no Electrobun import.
- [x] Vite contains no hard-coded Electrobun decorator or transport switch.
- [x] A fake second adapter adds its own outer/method decorators without Core modifications.
- [x] Runtime packages contain no filesystem source discovery.

### DI Policy

- [x] Managed classes auto-inject by type.
- [x] Plain classes do not accidentally auto-inject.
- [x] A plain class with explicit `@Inject(Class)` and a binding resolves.
- [x] Interfaces require explicit runtime tokens.
- [x] Missing runtime-token bindings fail clearly.

### Invocation

- [x] Interleaved injected/caller parameters remain correct.
- [x] Generated caller indexes remain stable.
- [x] Parameter-injector indexes remain correct.
- [x] Ordinary caller parameters require no `@Arg(index)` API.

### Provider Lifecycle

- [x] `register()` runs exactly once.
- [x] `boot()` runs per invocation.
- [x] Concurrent invocation state remains isolated.

### Release

- [x] Public packages are versioned and packaged as `0.1.0` with intended metadata and contents.
- [x] Public runtime and declaration exports match committed allowlists.
- [x] Packed packages install, typecheck, and execute together in an isolated consumer.
- [x] The Electrobun and fake second-adapter examples build.
- [x] Generated frontend contracts compile with application-specific types.
- [x] Compiler, startup, and invocation performance sanity ceilings pass.
- [x] Repeated artifact generation produces no content or timestamp churn.
- [x] Clean installation, workspace typechecking, tests, builds, and release audits pass.
- [x] Release documentation and deferred-feature records are complete.

## Existing Evidence to Reuse

- The completed prior-milestone regression closure passed workspace typechecking, 110 focused tests, the full 338-test repository suite, every workspace build, the built-export audit, the Electrobun SDK contract, the native Electrobun process, an isolated frozen install, and diff hygiene on 2026-08-24.
- Existing Milestones 4, 5, 8, 9, 10, 12, and 12F tests already exercise the DI, invocation-index, Provider lifecycle, generated-contract, runtime-scanning, and fake-adapter behaviors required above.
- Those suites will not be rerun independently unless Milestone 13 changes their owning implementation. One final `pnpm quality` run remains required for release readiness.

## Implemented

- Created this progress record before implementation began.
- Expanded the package-boundary audit across Core, Vite, Electrobun, runtime filesystem imports, platform switches, and internal source imports.
- Added exact bootstrap-expression diagnostic locations while preserving existing compiler codes, messages, file paths, and causes.
- Promoted the fake-queue compiler/runtime fixture into a private buildable second-adapter example and redirected its existing integration coverage to the example source.
- Prepared all three public packages as ESM-only `0.1.0` packages with GPL-3.0-only licensing, public npm metadata, publish-safe Core ranges, and restricted artifact file lists.
- Committed complete runtime/declaration export allowlists and expanded the built-export audit across Core, Vite, and Electrobun.
- Added a tarball audit covering contents, packed manifests, isolated installation, public typechecking, and ESM execution.
- Added representative compiler, startup, invocation, and byte/timestamp-stability sanity checks.
- Added the root README, changelog, release-readiness guide, promoted example guide, updated release-facing package/example documentation, and CI release gates.

## Remaining

- None.

## Tests Added

- `tests/milestone-13/release-architecture.test.ts` — production platform/runtime/source-import boundaries.
- `tests/milestone-13/diagnostics.test.ts` — exact typed bootstrap diagnostic span.
- `tests/release-package-audit.mjs` — package/tarball/isolated-consumer release contract.
- `tests/performance-sanity.mjs` — compiler/startup/invocation ceilings and artifact churn.
- `tests/fixtures/milestone-13-public-exports.json` — reviewed JavaScript/declaration allowlists.

## Tests Run

- Focused Milestone 13 Vitest suite.
- Affected Milestone 12F fake-adapter integration file.
- Expanded package-boundary script.
- Targeted Vite/fake-example production build and complete test TypeScript semantic check.
- Built public-export audit.
- Performance and generation-churn sanity command.
- Tarball release audit in an isolated consumer.

## Test Results

- Passed: 2 Milestone 13 files and 5 tests.
- Passed: affected Milestone 12F file and 5 tests after example promotion.
- Passed: release package-boundary audit and targeted TypeScript/build checks.
- Passed: all three built runtime/declaration export allowlists.
- Passed: packed `0.1.0` manifests/contents, isolated installation, public typechecking, and ESM execution.
- Passed performance medians: compiler 1,343.381 ms, startup 0.0057 ms, invocation 0.00163 ms/call; second artifact pass changed no files or timestamps.
- Passed final `pnpm quality`: release boundaries, production/test typechecking, Electrobun 1.18.1 SDK contract, 35 files and 343 tests, all five buildable workspace projects, and all public runtime/declaration export allowlists.
- Passed final isolated frozen-lockfile installation and production/test workspace typechecking.
- Passed `git diff --check`; only expected Windows line-ending conversion warnings were reported, and no untracked tarballs or temporary generated registries remained.
- Failed intermediate: the first two isolated tarball installs showed that published `^0.1.0` Core dependencies need a temporary-consumer override before publication and that the shared pnpm store lacked the Electrobun tarball offline. The audit now overrides Core to the packed tarball and performs a normal isolated dependency install; the approved rerun passed.

## Important Decisions

- Prepare `0.1.0` without performing any external publication action.
- Preserve the public ESM `.` export contract and documented extension/manual-integration APIs.
- Reuse fresh prior-closure evidence for unchanged behavior and run broad regression only once at the final gate.
- Promote the existing fake-queue proof instead of maintaining a duplicate second-adapter implementation.

## Expected Behavior

After this milestone, the three public Bunwire packages are release-candidate tarballs with audited exports, actionable compiler diagnostics, documented architecture and deferred scope, representative performance evidence, deterministic generation, and verified installation and execution.

## Not Expected Yet

- npm publication, Git tags, GitHub releases, credentials, or provenance signing.
- Any feature listed as deferred until after the first release.

## Known Limitations

- Packages are prepared but not published; the isolated pre-publication consumer deliberately overrides `@bunwire/core@^0.1.0` to the freshly packed Core tarball.
- Supported/deferred `0.1.0` behavior is recorded in `docs/RELEASE.md`; no deferred feature was partially implemented.

## Blockers

- None.

## Next Work Within This Milestone

- None. Bunwire `0.1.0` is a verified release candidate and has not been published or tagged.

## Regression Checks

- The fresh prior-milestone closure evidence remains authoritative for the unchanged native Electrobun process, virtual-module HMR, token identity, public compiler imports, and filesystem case behavior.
- The one final full repository regression passed every architecture, Core, compiler, generator, middleware, Electrobun, generated-client, and type-level test.
- The native Electrobun smoke was not repeated because Milestone 13 changed no Electrobun runtime/native fixture code.
